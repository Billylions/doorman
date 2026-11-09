// The AI hint, .env import and `doorman run`, end to end with a real Keychain
// (isolated service name) and the real CLI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-feat-'));
process.env.DOORMAN_HOME = HOME;
process.env.DOORMAN_SERVICE = 'doorman-test';
const env = { ...process.env };
const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');
const STRIPE = 'sk_test_FEAT_' + Math.random().toString(36).slice(2);
const OPENAI = 'sk-FEAT-' + Math.random().toString(36).slice(2);
const DOTENV = path.join(HOME, '.env');
let vault;

const doorman = (args, opts = {}) => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', ...opts });

before(async () => {
  vault = await import('../src/vault.js');
  fs.writeFileSync(DOTENV, `# my app\nSTRIPE_SECRET_KEY=${STRIPE}\nOPENAI_API_KEY="${OPENAI}"\nPORT=3000\nNODE_ENV=development\n`);
});

after(async () => {
  for (const s of vault.listSecrets()) await vault.deleteSecret(s.name);
  fs.rmSync(HOME, { recursive: true, force: true });
});

test('every AI client is told how to use Doorman when it connects', async () => {
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], env }));
  const hint = client.getInstructions();
  await client.close();
  assert.match(hint, /Never ask the user to paste an API key/);
  assert.match(hint, /request_secret/);
  assert.match(hint, /\{\{doorman:NAME\}\}/);
});

test('doorman import checks in credentials, skips config, guesses hosts', () => {
  const r = doorman(['import', DOTENV, '--yes']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Checked in 2 key/);
  assert.ok(!r.stdout.includes(STRIPE), 'values are masked in the preview');
  const stripe = vault.getSecretMeta('stripe');
  assert.deepEqual(stripe.allowedHosts, ['api.stripe.com']);
  assert.equal(stripe.envName, 'STRIPE_SECRET_KEY');
  assert.equal(stripe.allowCommands, true);
  assert.equal(vault.getSecretMeta('port'), null);
  assert.equal(fs.readFileSync(DOTENV, 'utf8').includes(STRIPE), true, 'the .env file is not changed');
});

test('doorman run gives a program its keys under their original names', () => {
  const r = doorman(['run', '--', process.execPath, '-e',
    'console.log(process.env.STRIPE_SECRET_KEY === process.argv[1] && process.env.OPENAI_API_KEY === process.argv[2] ? "keys-ok" : "keys-missing")', STRIPE, OPENAI]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /keys-ok/);
});

test('doorman run scrubs keys when the output is captured (e.g. by an AI)', () => {
  const r = doorman(['run', '--', '/bin/sh', '-c', 'echo "$STRIPE_SECRET_KEY"; printf %s "$OPENAI_API_KEY" | base64; env | grep -c ELECTRON_RUN_AS_NODE; exit 3']);
  assert.equal(r.status, 3, 'exit code passes through');
  assert.ok(!r.stdout.includes(STRIPE) && !r.stdout.includes(Buffer.from(OPENAI).toString('base64')), r.stdout);
  assert.match(r.stdout, /\[doorman:stripe\]/);
  assert.match(r.stdout, /\[doorman:openai\]/);
  assert.match(r.stdout, /^0$/m, 'ELECTRON_RUN_AS_NODE never leaks into child programs');
});

test('doorman run --only and --env-file with placeholders', () => {
  const tpl = path.join(HOME, '.env.doorman');
  fs.writeFileSync(tpl, 'PAYMENTS_KEY={{doorman:stripe}}\nMODE=test\n');
  const r = doorman(['run', '--only', 'stripe', '--env-file', tpl, '--', process.execPath, '-e',
    'console.log([!!process.env.STRIPE_SECRET_KEY, !!process.env.OPENAI_API_KEY, process.env.PAYMENTS_KEY === process.argv[1], process.env.MODE].join(","))', STRIPE]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /true,false,true,test/);
});

test('doorman run refuses keys that are not allowed in commands', async () => {
  await vault.saveSecret({ name: 'locked', value: 'locked_value_123', allowedHosts: ['api.example.com'], allowCommands: false });
  const r = doorman(['run', '--only', 'locked', '--', '/bin/echo', 'hi']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Not allowed in commands: locked/);
});

test('the guest book records imports and runs, never values', () => {
  const raw = fs.readFileSync(path.join(HOME, 'audit.log'), 'utf8');
  assert.match(raw, /"ui_import"/);
  assert.match(raw, /"doorman_run"/);
  assert.ok(!raw.includes(STRIPE) && !raw.includes(OPENAI));
});
