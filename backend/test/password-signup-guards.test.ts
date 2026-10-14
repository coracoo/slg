import test from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { ConnectionRegistry, type ConnInfo } from '../api/src/connections';
import { handleMessage, type HandlerContext } from '../api/src/handlers';
import { PasswordSignupLimiter, type PasswordSignupService } from '../api/src/password-signup';
import { Op, type ResponseFrame } from '../common/src/protocol';

const credentials = { username: 'new-player', password: 'test-only-password', asAgent: false };

function setup(options: { signup?: PasswordSignupService; host?: string; disabled?: string[]; duplicate?: boolean } = {}) {
  const queries: string[] = [];
  const sent: ResponseFrame[] = [];
  const socket = {
    readyState: 1, OPEN: 1,
    send: (raw: string) => sent.push(JSON.parse(raw) as ResponseFrame),
    close: () => undefined,
  } as unknown as WebSocket;
  const registry = new ConnectionRegistry();
  const conn: ConnInfo = {
    socket, ip: '192.168.1.8', host: options.host ?? 'nas.lan', accountId: null,
    username: null, role: null, sessionId: null, connectedAt: new Date(),
  };
  registry.add(conn);
  const ctx: HandlerContext = {
    pool: {
      query: async (sql: string) => {
        queries.push(sql);
        return options.duplicate ? { rowCount: 1, rows: [{ id: 'existing' }] } : { rowCount: 0, rows: [] };
      },
      connect: async () => { throw new Error('Guard tests must never acquire a write connection'); },
    } as unknown as HandlerContext['pool'],
    registry,
    passwordDisabledHosts: new Set(options.disabled ?? []),
    passwordSignup: options.signup,
  };
  async function request(data: Record<string, unknown>) {
    const before = sent.length;
    await handleMessage(ctx, conn, JSON.stringify({ op: Op.LOGIN, seq: 1, data }));
    return sent.slice(before).find((frame) => frame.op === Op.LOGIN);
  }
  return { request, queries, conn };
}

function enabled(): PasswordSignupService {
  return { enabled: true, limiter: new PasswordSignupLimiter() };
}

test('malformed register flags and mixed token/register requests fail before querying', async () => {
  const t = setup({ signup: enabled() });
  for (const register of ['true', 1, null, {}, []]) {
    assert.equal((await t.request({ ...credentials, register }))?.error?.code, 'INVALID_PARAMS');
  }
  for (const register of [true, false]) {
    for (const token of ['test-token', '', null, 42, {}]) {
      assert.equal((await t.request({ ...credentials, token, register }))?.error?.code, 'INVALID_PARAMS');
    }
  }
  assert.deepEqual(t.queries, []);
});

test('explicit registration is closed when service is missing or disabled', async () => {
  for (const signup of [undefined, { ...enabled(), enabled: false }]) {
    const t = setup({ signup });
    assert.equal((await t.request({ ...credentials, register: true }))?.error?.code, 'SIGNUP_CLOSED');
    assert.deepEqual(t.queries, []);
  }
});

test('ordinary LOGIN and register:false never create an account with signup enabled', async () => {
  const t = setup({ signup: enabled() });
  for (const data of [credentials, { ...credentials, register: false }]) {
    assert.equal((await t.request(data))?.error?.code, 'SIGNUP_CLOSED');
  }
  assert.equal(t.queries.length, 2);
  assert.ok(t.queries.every((sql) => sql.startsWith('SELECT id, username, password_hash')));
});

test('Agent and password-disabled-host guards also apply to explicit registration', async () => {
  const t = setup({ signup: enabled(), host: 'NAS.LAN:443', disabled: ['nas.lan'] });
  assert.equal((await t.request({ ...credentials, register: true, asAgent: true }))?.error?.code, 'AGENT_PASSWORD_FORBIDDEN');
  assert.equal((await t.request({ ...credentials, register: true }))?.error?.code, 'PASSWORD_LOGIN_CLOSED');
  assert.deepEqual(t.queries, []);
});

test('invalid signup credentials fail before any database work', async () => {
  const t = setup({ signup: enabled() });
  for (const extra of [{ username: 'with space' }, { password: 'short' }, { asAgent: 'false' }]) {
    assert.equal((await t.request({ ...credentials, register: true, ...extra }))?.error?.code, 'INVALID_PARAMS');
  }
  assert.deepEqual(t.queries, []);
});

test('duplicates consume signup attempts and the limit runs before database access', async () => {
  const t = setup({ signup: enabled(), duplicate: true });
  for (let i = 0; i < 5; i++) {
    assert.equal((await t.request({ ...credentials, register: true }))?.error?.code, 'INVALID_CREDENTIALS');
  }
  assert.equal(t.queries.length, 5);
  assert.equal((await t.request({ ...credentials, register: true }))?.error?.code, 'RATE_LIMITED');
  assert.equal(t.queries.length, 5);
});

test('global signup budget applies across separate connections and IPs', async () => {
  const signup = enabled();
  for (let i = 0; i < 30; i++) {
    const t = setup({ signup, duplicate: true });
    t.conn.ip = `192.0.2.${i + 1}`;
    assert.equal((await t.request({ ...credentials, register: true }))?.error?.code, 'INVALID_CREDENTIALS');
  }
  const blocked = setup({ signup, duplicate: true });
  assert.equal((await blocked.request({ ...credentials, register: true }))?.error?.code, 'RATE_LIMITED');
  assert.deepEqual(blocked.queries, []);
});
