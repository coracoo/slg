import test from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { registerPasswordAccount, createPasswordSignupService } from '../api/src/password-signup';
import { loginWithPassword } from '../api/src/auth';
import { verifyPassword } from '../api/src/password';
import { hashAgentToken } from '../api/src/agent-token';
import { ConnectionRegistry, type ConnInfo } from '../api/src/connections';
import { handleMessage, type HandlerContext } from '../api/src/handlers';
import { Op, PROTOCOL_VERSION, type ResponseFrame } from '../common/src/protocol';
import { INITIAL_BUILDINGS, INITIAL_RESOURCES, INITIAL_POPULATION } from '../common/src/rules';
import { signupPool } from './helpers/password-signup-pool';

const input = { username: 'new-player', password: 'passe\u0301 word', signupIp: '192.0.2.10' };
// Synthetic fixture produced using v3's unchanged scrypt parameters and a fixed test salt.
const LEGACY_HASH = 'scrypt$16384$8$1$bGVnYWN5LXYzLXNhbHQtMTY=$3bz7QvtkPBhFOJNrWy8D84p66LwnLBOrBECnEbbY3NVeAm3ThT/j6QWy4fT1g1mJb2yYJ3dt+QPQHXvAi/FRlg==';

test('registration reuses all current initial account, city, building and token state in one transaction', async () => {
  const t = signupPool();
  const result = await registerPasswordAccount(t.pool, input);
  assert.equal(result.ok, true);
  const stored = t.accounts.get(input.username);
  assert.ok(stored?.password_hash);
  assert.equal(await verifyPassword('passé word', stored.password_hash), true);
  assert.equal(await verifyPassword('wrong-password', stored.password_hash), false);
  const tx = t.transactions[0];
  assert.equal(tx.committed, true);
  assert.equal(tx.rolledBack, false);
  assert.equal(tx.released, true);
  assert.equal(tx.calls[0].sql, 'BEGIN');
  assert.equal(tx.calls.at(-1)?.sql, 'COMMIT');
  const account = tx.calls.find((call) => call.sql.startsWith('INSERT INTO accounts '));
  assert.equal(account?.params[2], input.signupIp);
  assert.ok(account?.params[3] instanceof Date, 'newbie protection is initialized by current helper');
  const city = tx.calls.find((call) => call.sql.startsWith('INSERT INTO cities '));
  assert.deepEqual(city?.params, [stored.id, INITIAL_RESOURCES.gold, INITIAL_RESOURCES.wood,
    INITIAL_RESOURCES.food, INITIAL_RESOURCES.stone, INITIAL_RESOURCES.iron, INITIAL_POPULATION]);
  const buildings = tx.calls.filter((call) => call.sql.startsWith('INSERT INTO city_buildings '));
  assert.deepEqual(buildings.map((call) => call.params.slice(1)), Object.entries(INITIAL_BUILDINGS));
  assert.ok(tx.calls.some((call) => call.sql.startsWith('UPDATE cities SET x = $2')));
  const token = tx.calls.find((call) => call.sql.startsWith('INSERT INTO agent_tokens '));
  assert.equal(token?.params[0], stored.id);
  assert.match(String(token?.params[2]), /^sk_/);
  assert.equal(token?.params[1], hashAgentToken(String(token?.params[2])));
  assert.deepEqual(await loginWithPassword(t.pool, input), result, 'new password works with unchanged login path');
});

test('existing v3 password hashes remain usable and duplicate registration never overwrites them', async () => {
  const t = signupPool({ seed: { id: 'legacy-account', username: input.username, password_hash: LEGACY_HASH } });
  assert.equal((await loginWithPassword(t.pool, { ...input, password: 'legacy-pass-123' })).ok, true);
  assert.equal((await loginWithPassword(t.pool, { ...input, password: 'wrong-password' })).code, 'INVALID_CREDENTIALS');
  assert.equal((await registerPasswordAccount(t.pool, input)).code, 'INVALID_CREDENTIALS');
  assert.equal(t.accounts.get(input.username)?.password_hash, LEGACY_HASH);
  assert.equal(t.transactions.length, 0);
});

test('new signup validation does not lock out a pre-existing username containing whitespace', async () => {
  const t = signupPool({ seed: { id: 'legacy-account', username: 'old player', password_hash: LEGACY_HASH } });
  assert.equal((await loginWithPassword(t.pool, { ...input, username: 'old player', password: 'legacy-pass-123' })).ok, true);
});

test('passwordless OAuth/WeChat accounts cannot be claimed through login or registration', async () => {
  const t = signupPool({ seed: { id: 'oauth-account', username: input.username, password_hash: null } });
  assert.equal((await loginWithPassword(t.pool, input)).code, 'INVALID_CREDENTIALS');
  assert.equal((await registerPasswordAccount(t.pool, input)).code, 'INVALID_CREDENTIALS');
  assert.equal(t.accounts.get(input.username)?.password_hash, null);
  assert.equal(t.transactions.length, 0);
});

test('initialization failures rollback and release without committing a partial account', async () => {
  for (const failAt of ['INSERT INTO cities ', 'INSERT INTO city_buildings ', 'WITH sample AS ', 'INSERT INTO agent_tokens ', 'COMMIT']) {
    const t = signupPool({ failAt });
    await assert.rejects(registerPasswordAccount(t.pool, input), /Injected initialization failure/);
    assert.equal(t.accounts.size, 0);
    assert.equal(t.transactions[0].committed, false);
    assert.equal(t.transactions[0].rolledBack, true);
    assert.equal(t.transactions[0].released, true);
    assert.equal(t.transactions[0].calls.at(-1)?.sql, 'ROLLBACK');
  }
});

test('no available main-city tile rolls back instead of committing a half-initialized account', async () => {
  const t = signupPool({ noTile: true });
  await assert.rejects(registerPasswordAccount(t.pool, input), /could not allocate a main-city world tile/);
  assert.equal(t.accounts.size, 0);
  assert.equal(t.transactions[0].rolledBack, true);
  assert.equal(t.transactions[0].released, true);
});

test('same-name race succeeds once; the unique-constraint loser rolls back without overwriting', async () => {
  const t = signupPool();
  const results = await Promise.all([
    registerPasswordAccount(t.pool, input),
    registerPasswordAccount(t.pool, { ...input, password: 'second-password' }),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.code === 'INVALID_CREDENTIALS').length, 1);
  assert.equal(t.accounts.size, 1);
  assert.equal(t.transactions.filter((tx) => tx.committed).length, 1);
  assert.equal(t.transactions.filter((tx) => tx.rolledBack).length, 1);
  assert.ok(t.transactions.every((tx) => tx.released));
  const winningPassword = results[0].ok ? input.password : 'second-password';
  assert.equal(await verifyPassword(winningPassword, t.accounts.get(input.username)!.password_hash!), true);
});

test('other unique constraints are not mistaken for a duplicate username', async () => {
  const failure = Object.assign(new Error('duplicate agent token'), { code: '23505', constraint: 'agent_tokens_token_hash_key' });
  const t = signupPool({ failAt: 'INSERT INTO agent_tokens ', failure });
  await assert.rejects(registerPasswordAccount(t.pool, input), (error) => error === failure);
  assert.equal(t.transactions[0].rolledBack, true);
  assert.equal(t.transactions[0].released, true);
});

test('explicit LOGIN registration issues the current session response and binds a player connection', async () => {
  const t = signupPool();
  const sent: ResponseFrame[] = [];
  const socket = { readyState: 1, OPEN: 1, send: (raw: string) => sent.push(JSON.parse(raw)), close: () => undefined } as unknown as WebSocket;
  const registry = new ConnectionRegistry();
  const conn: ConnInfo = {
    socket, ip: input.signupIp, host: 'nas.lan', accountId: null, username: null,
    role: null, sessionId: null, connectedAt: new Date(),
  };
  registry.add(conn);
  const ctx: HandlerContext = {
    pool: t.pool, registry, passwordDisabledHosts: new Set(), passwordSignup: createPasswordSignupService(true),
  };
  await handleMessage(ctx, conn, JSON.stringify({ op: Op.LOGIN, seq: 7, data: {
    username: input.username, password: input.password, asAgent: false, register: true,
  } }));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].ok, true);
  assert.equal(sent[0].seq, 7);
  const response = sent[0].data as Record<string, unknown>;
  assert.equal(response.username, input.username);
  assert.equal(response.accountId, conn.accountId);
  assert.equal(response.role, 'player');
  assert.equal(response.protocolVersion, PROTOCOL_VERSION);
  assert.equal(response.docNotice, null);
  assert.match(String(response.sessionToken), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(conn.sessionId, 'session-1');
  assert.deepEqual(t.sessions, [conn.accountId]);
});
