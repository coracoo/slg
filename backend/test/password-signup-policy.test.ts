import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPasswordSignupService,
  readPasswordSignupEnabled,
  validPasswordSignupInput,
  PasswordSignupLimiter,
} from '../api/src/password-signup';

test('signup is disabled unless its environment switch is exactly true', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes', ' true ']) {
    assert.equal(readPasswordSignupEnabled({ LOCAL_PASSWORD_SIGNUP_ENABLED: value }), false);
  }
  assert.equal(readPasswordSignupEnabled({ LOCAL_PASSWORD_SIGNUP_ENABLED: 'true' }), true);
  assert.equal(createPasswordSignupService(false).enabled, false);
});

test('signup accepts bounded usernames without whitespace or control characters', () => {
  for (const name of ['', ' ', ' Alice', 'Alice ', 'with space', 'a\nb', 'a\0b', 'a\u007fb', 'a\u0085b', 'a'.repeat(33)]) {
    assert.equal(validPasswordSignupInput(name, '123456'), false, JSON.stringify(name));
  }
  for (const name of ['玩家', 'alice-1', 'a'.repeat(32)]) {
    assert.equal(validPasswordSignupInput(name, '123456'), true);
  }
});

test('signup keeps the existing password length and normalization policy', () => {
  assert.equal(validPasswordSignupInput('alice', '12345'), false);
  assert.equal(validPasswordSignupInput('alice', '123456'), true);
  assert.equal(validPasswordSignupInput('alice', 'p'.repeat(64)), true);
  assert.equal(validPasswordSignupInput('alice', 'p'.repeat(65)), false);
  assert.equal(validPasswordSignupInput('alice', '  pass word  '), true);
});

test('five attempts per IP per ten minutes; the sixth is rejected until reset', () => {
  const limiter = new PasswordSignupLimiter();
  for (let i = 0; i < 5; i++) assert.equal(limiter.allow('ip-a', 0), true);
  assert.equal(limiter.allow('ip-a', 599_999), false);
  assert.equal(limiter.allow('ip-b', 599_999), true);
  assert.equal(limiter.allow('ip-a', 600_000), true);
});

test('global limit bounds work and memory even when clients rotate IP addresses', () => {
  const limiter = new PasswordSignupLimiter();
  for (let i = 0; i < 30; i++) assert.equal(limiter.allow(`ip-${i}`, 1), true);
  assert.equal(limiter.allow('new-ip', 2), false);
  assert.equal(limiter.allow('new-ip', 600_001), true);
});

test('unknown clients share one IP bucket; a backwards clock resets the window', () => {
  const limiter = new PasswordSignupLimiter();
  for (let i = 0; i < 5; i++) assert.equal(limiter.allow(null, 1_000), true);
  assert.equal(limiter.allow(null, 1_001), false);
  assert.equal(limiter.allow(null, 900), true);
});
