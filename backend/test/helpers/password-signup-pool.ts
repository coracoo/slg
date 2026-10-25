// Stateful SQL contract double; tests execute the real account initializer without a database.
// This models the username unique constraint and transaction boundaries, not PostgreSQL locking.
import type pg from 'pg';

export interface AccountRecord {
  id: string;
  username: string;
  password_hash: string | null;
  season_id?: number | null;
}
export interface SqlCall { sql: string; params: unknown[] }
export interface TransactionRecord {
  calls: SqlCall[];
  committed: boolean;
  rolledBack: boolean;
  released: boolean;
}

export function signupPool(options: { failAt?: string; failure?: Error; noTile?: boolean; seed?: AccountRecord } = {}) {
  const accounts = new Map<string, AccountRecord>();
  if (options.seed) accounts.set(options.seed.username, options.seed);
  const season = { id: 1, name: 'Season 1', status: 'active',
    start_at: new Date('2026-10-25T00:00:00Z'), end_at: new Date('2026-11-22T00:00:00Z'),
    seed: 20260927, time_scale: 1, ended_at: null };
  const pendingNames = new Set<string>();
  const reads: SqlCall[] = [];
  const transactions: TransactionRecord[] = [];
  const sessions: string[] = [];
  const rows = (data: unknown[]) => ({ rowCount: data.length, rows: data });
  const pool = {
    query: async (query: string, params: unknown[] = []) => {
      const sql = query.replace(/\s+/g, ' ').trim();
      reads.push({ sql, params });
      if (sql.startsWith('SELECT ') && sql.includes('FROM accounts WHERE username = $1')) {
        const account = accounts.get(String(params[0]));
        return rows(account ? [account] : []);
      }
      if (sql.startsWith('UPDATE accounts SET last_active_at =')) return rows([]);
      if (sql === 'DELETE FROM sessions WHERE expires_at < now()') return rows([]);
      if (sql.startsWith('INSERT INTO sessions')) {
        sessions.push(String(params[0]));
        return rows([{ id: `session-${sessions.length}`, expires_at: new Date('2030-01-01T00:00:00Z') }]);
      }
      throw new Error(`Unexpected pool SQL: ${sql}`);
    },
    connect: async () => {
      const tx: TransactionRecord = { calls: [], committed: false, rolledBack: false, released: false };
      transactions.push(tx);
      const id = `account-${transactions.length}`;
      let begun = false;
      let checkedSeasonMembership = false;
      let account: AccountRecord | undefined;
      let cityPosition: { x: number | null; y: number | null } = { x: null, y: null };
      return {
        query: async (query: string, params: unknown[] = []) => {
          const sql = query.replace(/\s+/g, ' ').trim();
          tx.calls.push({ sql, params });
          if (options.failAt && sql.startsWith(options.failAt)) throw options.failure ?? new Error('Injected initialization failure');
          if (sql === 'BEGIN') { begun = true; return rows([]); }
          if (!begun) throw new Error('Account initialization must be transactional');
          if (sql === 'ROLLBACK') {
            tx.rolledBack = true;
            if (account) pendingNames.delete(account.username);
            return rows([]);
          }
          if (sql === 'COMMIT') {
            if (!account && !checkedSeasonMembership) throw new Error('Cannot commit without an account or season membership check');
            if (account) {
              accounts.set(account.username, account);
              pendingNames.delete(account.username);
            }
            tx.committed = true;
            return rows([]);
          }
          if (sql.startsWith('INSERT INTO accounts ')) {
            const username = String(params[0]);
            if (accounts.has(username) || pendingNames.has(username)) {
              throw Object.assign(new Error('duplicate username'), { code: '23505', constraint: 'accounts_username_key' });
            }
            pendingNames.add(username);
            const hasSeason = sql.includes('newbie_until, season_id)') && sql.includes("SELECT id FROM seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1");
            account = { id, username, password_hash: String(params[1]), season_id: hasSeason ? season.id : null };
            return rows([{ id, username }]);
          }
          if (sql === "SELECT id, name, status, start_at, end_at, seed, time_scale, ended_at FROM seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1") return rows([season]);
          if (sql === 'SELECT season_id FROM accounts WHERE id = $1 FOR UPDATE') {
            const existing = [...accounts.values()].find((item) => item.id === params[0]);
            checkedSeasonMembership = !!existing;
            return rows(existing ? [{ season_id: existing.season_id ?? null }] : []);
          }
          if (sql.startsWith('INSERT INTO cities ')) return rows([{ id: `city-${id}` }]);
          if (sql.startsWith('INSERT INTO city_buildings ')) return rows([]);
          if (sql.startsWith('WITH sample AS ')) return options.noTile ? rows([]) : rows([{ x: 17, y: 23 }]);
          if (sql.startsWith('UPDATE cities SET x = $2')) {
            cityPosition = { x: Number(params[1]), y: Number(params[2]) };
            return rows([]);
          }
          if (sql.startsWith('INSERT INTO agent_tokens ')) return rows([]);
          if (sql === 'SELECT x, y FROM cities WHERE account_id = $1') return rows([cityPosition]);
          throw new Error(`Unexpected transaction SQL: ${sql}`);
        },
        release: () => { tx.released = true; },
      };
    },
  } as unknown as pg.Pool;
  return { pool, accounts, reads, transactions, sessions };
}
