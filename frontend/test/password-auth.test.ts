import assert from 'node:assert/strict';
import test from 'node:test';
import { FALLBACK_AUTH_CONFIG, parseAuthConfig } from '../src/state/authConfig';
import { passwordLoginData, passwordSignupErrorText, validatePasswordSignup } from '../src/api/passwordLogin';
import { loginErrorText } from '../src/api/errorText';
import { getCopy } from '../src/i18n/bundle';

test('signup stays closed for missing, false or non-boolean flags and disabled password login', () => {
  assert.equal(FALLBACK_AUTH_CONFIG.passwordSignup, false);
  for (const flag of [undefined, false, 'true', 1, null]) {
    assert.equal(parseAuthConfig({ passwordSignup: flag }).passwordSignup, false);
  }
  assert.equal(parseAuthConfig({ passwordSignup: true }).passwordSignup, true);
  assert.equal(parseAuthConfig({ passwordSignup: true, passwordLogin: false }).passwordSignup, false);
  assert.equal(parseAuthConfig({}).passwordLogin, true);
});

test('normal password login never opts into registration', () => {
  assert.deepEqual(passwordLoginData('player', 'password'), { username: 'player', password: 'password', asAgent: false });
  assert.deepEqual(passwordLoginData('player', 'password', false), { username: 'player', password: 'password', asAgent: false });
  assert.deepEqual(passwordLoginData('player', 'password', true), { username: 'player', password: 'password', asAgent: false, register: true });
});

test('registration validates trimmed username, password boundaries and exact confirmation', () => {
  assert.equal(validatePasswordSignup('  p  ', '123456', '123456'), null);
  assert.equal(validatePasswordSignup(' '.repeat(4), '123456', '123456'), 'usernameInvalid');
  assert.equal(validatePasswordSignup('p'.repeat(32), 'p'.repeat(64), 'p'.repeat(64)), null);
  assert.equal(validatePasswordSignup('p'.repeat(33), '123456', '123456'), 'usernameInvalid');
  assert.equal(validatePasswordSignup('player name', '123456', '123456'), 'usernameInvalid');
  assert.equal(validatePasswordSignup('player\u0000name', '123456', '123456'), 'usernameInvalid');
  assert.equal(validatePasswordSignup('player\u0085name', '123456', '123456'), 'usernameInvalid');
  assert.equal(validatePasswordSignup('p', '12345', '12345'), 'passwordInvalid');
  assert.equal(validatePasswordSignup('p', 'p'.repeat(65), 'p'.repeat(65)), 'passwordInvalid');
  assert.equal(validatePasswordSignup('p', '123456', '123457'), 'passwordMismatch');
  assert.equal(validatePasswordSignup('p', '123456', ''), 'passwordMismatch');
});

test('registration error mapping is localized without changing ordinary login errors', () => {
  const copy = getCopy();
  assert.equal(passwordSignupErrorText('INVALID_CREDENTIALS', 'backend username taken'), copy.PASSWORD_SIGNUP_COPY.usernameTaken);
  assert.equal(passwordSignupErrorText('RATE_LIMITED', 'backend rate limited'), copy.PASSWORD_SIGNUP_COPY.rateLimited);
  assert.doesNotMatch(copy.PASSWORD_SIGNUP_COPY.rateLimited, /一分钟|a minute/);
  assert.equal(passwordSignupErrorText('SIGNUP_CLOSED', 'backend closed'), copy.PASSWORD_SIGNUP_COPY.closed);
  assert.equal(passwordSignupErrorText('INVALID_PARAMS', undefined), copy.COPY.errors.login.invalidParams);
  assert.equal(loginErrorText('INVALID_CREDENTIALS', 'backend username taken'), copy.COPY.errors.login.invalidCredentials);
});
