// Opt-in self-hosted password registration; not automatic password-login signup.
import type pg from 'pg';
import { insertAccountWithCity, type LoginResult } from './auth';
import { hashPassword } from './password';

export function readPasswordSignupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LOCAL_PASSWORD_SIGNUP_ENABLED === 'true';
}

export function validPasswordSignupInput(username: string, password: string): boolean {
  return username.length >= 1 && username.length <= 32 && username === username.trim()
    && !/[\s\p{Cc}]/u.test(username)
    && password.length >= 6 && password.length <= 64;
}

// Attempts (including duplicate names) are limited before DB writes/scrypt work.
// Single-API, in-memory fixed windows. Restart resets counters; this is not a public-service firewall.
export class PasswordSignupLimiter {
  private startsAt: number | null = null;
  private total = 0;
  private readonly byIp = new Map<string, number>();
  constructor(
    private readonly perIp = 5,
    private readonly global = 30,
    private readonly windowMs = 10 * 60_000,
  ) {}
  allow(ip: string | null, now = Date.now()): boolean {
    if (this.startsAt === null || now - this.startsAt >= this.windowMs || now < this.startsAt) {
      this.startsAt = now;
      this.total = 0;
      this.byIp.clear();
    }
    const key = ip ?? 'unknown';
    const count = this.byIp.get(key) ?? 0;
    if (count >= this.perIp || this.total >= this.global) return false;
    this.total += 1;
    this.byIp.set(key, count + 1);
    return true;
  }
}

export interface PasswordSignupService {
  enabled: boolean;
  limiter: PasswordSignupLimiter;
}

export function createPasswordSignupService(enabled: boolean): PasswordSignupService {
  return { enabled, limiter: new PasswordSignupLimiter() };
}

export async function registerPasswordAccount(
  pool: pg.Pool,
  input: { username: string; password: string; signupIp: string | null },
): Promise<LoginResult> {
  // Avoid expensive hashing on an already occupied username. The unique constraint below
  // remains the authority when two requests pass this check concurrently.
  const existing = await pool.query('SELECT id FROM accounts WHERE username = $1', [input.username]);
  if (existing.rowCount) return { ok: false, code: 'INVALID_CREDENTIALS' };
  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await insertAccountWithCity(client, {
      username: input.username, passwordHash, signupIp: input.signupIp,
    });
    // Never commit a half-initialized account if no world tile could be assigned.
    const city = await client.query('SELECT x, y FROM cities WHERE account_id = $1', [account.id]);
    if (city.rows.length !== 1 || city.rows[0].x === null || city.rows[0].y === null) {
      throw new Error('Registration could not allocate a main-city world tile');
    }
    await client.query('COMMIT');
    return { ok: true, account };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    const pgError = err as { code?: string; constraint?: string };
    if (pgError.code === '23505' && pgError.constraint === 'accounts_username_key') {
      return { ok: false, code: 'INVALID_CREDENTIALS' };
    }
    throw err;
  } finally {
    client.release();
  }
}
