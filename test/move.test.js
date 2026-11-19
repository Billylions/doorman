// Moving a key between your own keys and a client's.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-move-'));
process.env.DOORMAN_HOME = HOME;
process.env.DOORMAN_SERVICE = 'doorman-test-move';
const rnd = () => Math.random().toString(36).slice(2, 10);
const VALUE = 'sk_test_MOVE_' + rnd();
let vault;

before(async () => {
  vault = await import('../src/vault.js');
  await vault.saveSecret({ name: 'stripe', value: VALUE, description: 'Stripe test key', allowedHosts: ['api.stripe.com'], lockHosts: true });
});

after(async () => {
  for (const s of vault.listSecrets()) await vault.deleteSecret(s.id);
  fs.rmSync(HOME, { recursive: true, force: true });
});

test('a key moves to a client with its value and settings', async () => {
  const moved = await vault.moveSecret('stripe', 'Acme Corp');
  assert.equal(moved.id, 'acme-corp/stripe');
  assert.equal(moved.room, 'acme-corp');
  assert.equal(moved.description, 'Stripe test key');
  assert.equal(moved.lockHosts, true);
  assert.equal(await vault.revealSecret('acme-corp/stripe'), VALUE);
  assert.equal(vault.getSecretMeta('stripe'), null);
  await assert.rejects(vault.revealSecret('stripe'));
});

test('a key moves back to your own keys', async () => {
  const moved = await vault.moveSecret('acme-corp/stripe', 'mine');
  assert.equal(moved.id, 'stripe');
  assert.equal(await vault.revealSecret('stripe'), VALUE);
  assert.equal(vault.getSecretMeta('acme-corp/stripe'), null);
});

test('moving onto a key with the same name asks first, then replaces', async () => {
  const other = 'sk_test_OTHER_' + rnd();
  await vault.saveSecret({ name: 'stripe', room: 'Acme Corp', value: other });
  await assert.rejects(vault.moveSecret('stripe', 'Acme Corp'), (e) => e.code === 'exists');
  assert.equal(await vault.revealSecret('acme-corp/stripe'), other, 'nothing changes until you say replace');
  assert.equal(await vault.revealSecret('stripe'), VALUE);
  await vault.moveSecret('stripe', 'Acme Corp', { replace: true });
  assert.equal(await vault.revealSecret('acme-corp/stripe'), VALUE);
  assert.equal(vault.getSecretMeta('stripe'), null);
});

test('moving to the room it is already in changes nothing', async () => {
  const same = await vault.moveSecret('acme-corp/stripe', 'acme-corp');
  assert.equal(same.id, 'acme-corp/stripe');
  assert.equal(await vault.revealSecret('acme-corp/stripe'), VALUE);
});
