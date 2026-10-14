import type { ErrorCode } from './protocol';
import { getCopy } from '../i18n/bundle';
import { loginErrorText } from './errorText';

/** The login path must never create accounts without an explicit registration choice. */
export function passwordLoginData(username: string, password: string, register = false): Record<string, unknown> {
  return { username, password, asAgent: false, ...(register === true ? { register: true } : {}) };
}

export type PasswordSignupValidationError = 'usernameInvalid' | 'passwordInvalid' | 'passwordMismatch';

export function validatePasswordSignup(username: string, password: string, confirmation: string): PasswordSignupValidationError | null {
  const trimmed = username.trim();
  if (trimmed.length < 1 || trimmed.length > 32 || /[\s\p{Cc}]/u.test(trimmed)) return 'usernameInvalid';
  if (password.length < 6 || password.length > 64) return 'passwordInvalid';
  if (password !== confirmation) return 'passwordMismatch';
  return null;
}

/** In registration mode INVALID_CREDENTIALS means an occupied username. */
export function passwordSignupErrorText(code: ErrorCode | undefined, message: string | undefined): string {
  const { PASSWORD_SIGNUP_COPY } = getCopy();
  if (code === 'INVALID_CREDENTIALS') return PASSWORD_SIGNUP_COPY.usernameTaken;
  if (code === 'RATE_LIMITED') return PASSWORD_SIGNUP_COPY.rateLimited;
  if (code === 'SIGNUP_CLOSED') return PASSWORD_SIGNUP_COPY.closed;
  return loginErrorText(code, message);
}
