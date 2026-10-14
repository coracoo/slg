import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWsUrl } from '../src/api/wsUrl';

const byHost = { 'slg.yuntianyou.cc': 'wss://production.example/ws' };
const defaults = { sameOrigin: false, byHost, localOverride: null, apiPort: 8080 };

test('same-origin self-hosting uses page protocol and port before any production mapping or override', () => {
  assert.equal(resolveWsUrl({
    ...defaults,
    sameOrigin: true,
    location: { protocol: 'https:', host: 'slg.yuntianyou.cc:8443', hostname: 'slg.yuntianyou.cc' },
    localOverride: 'ws://localhost:18080/ws',
  }), 'wss://slg.yuntianyou.cc:8443/ws');
  assert.equal(resolveWsUrl({
    ...defaults,
    sameOrigin: true,
    location: { protocol: 'http:', host: 'localhost:18000', hostname: 'localhost' },
  }), 'ws://localhost:18000/ws');
});

test('without same-origin opt-in, mapped production hosts still take precedence', () => {
  assert.equal(resolveWsUrl({
    ...defaults,
    location: { protocol: 'https:', host: 'slg.yuntianyou.cc', hostname: 'slg.yuntianyou.cc' },
    localOverride: 'ws://localhost:18080/ws',
  }), 'wss://production.example/ws');
});

test('development keeps the configured API_PORT and optional local override', () => {
  assert.equal(resolveWsUrl(defaults), 'ws://127.0.0.1:8080/ws');
  assert.equal(resolveWsUrl({ ...defaults, apiPort: 8081 }), 'ws://127.0.0.1:8081/ws');
  assert.equal(resolveWsUrl({ ...defaults, apiPort: 8081, localOverride: 'ws://localhost:18080/ws' }), 'ws://localhost:18080/ws');
  assert.equal(resolveWsUrl({ ...defaults, sameOrigin: true, apiPort: 8081 }), 'ws://127.0.0.1:8081/ws');
});
