import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUEST_LOGIN } from '../common/src/protocol-doc-ops-auth';

test('LOGIN documents opt-in registration without changing the upstream protocol version', () => {
  const register = REQUEST_LOGIN.requestFields.find((field) => field.name === 'register');
  assert.equal(register?.type, 'boolean');
  assert.ok(register?.desc.includes('token'));
  assert.ok(REQUEST_LOGIN.summary.includes('LOCAL_PASSWORD_SIGNUP_ENABLED=true'));
  assert.ok(REQUEST_LOGIN.summary.includes('普通 LOGIN 不会自动建号'));
  assert.ok(REQUEST_LOGIN.errors.includes('RATE_LIMITED'));
});
