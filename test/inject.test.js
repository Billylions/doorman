import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPlaceholders, fill, hostAllowed, makeRedactor } from '../src/inject.js';

test('finds placeholders', () => {
  assert.deepEqual(findPlaceholders('Bearer {{doorman:stripe}}', '{{ doorman:gh }} and {{doorman:stripe}}'), ['stripe', 'gh']);
});

test('fills placeholders, leaves unknown ones', () => {
  assert.equal(fill('a {{doorman:x}} b {{doorman:y}}', { x: '1' }), 'a 1 b {{doorman:y}}');
});

test('host allowlist', () => {
  assert.ok(hostAllowed('api.stripe.com', ['api.stripe.com']));
  assert.ok(hostAllowed('files.stripe.com', ['*.stripe.com']));
  assert.ok(!hostAllowed('evil.com', ['api.stripe.com']));
  assert.ok(!hostAllowed('stripe.com.evil.com', ['*.stripe.com']));
});

test('redacts raw and encoded values', () => {
  const r = makeRedactor({ stripe: 'sk_test_abc123/+=' });
  const b64 = Buffer.from('sk_test_abc123/+=').toString('base64');
  const out = r(`raw sk_test_abc123/+= enc ${encodeURIComponent('sk_test_abc123/+=')} b64 ${b64}`);
  assert.ok(!out.includes('sk_test_abc123'));
  assert.ok(!out.includes(b64));
  assert.equal(out.split('[doorman:stripe]').length - 1, 3);
});
