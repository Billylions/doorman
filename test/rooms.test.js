// Rooms: each client's keys stay in that client's projects.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-rooms-'));
process.env.DOORMAN_HOME = HOME;
process.env.DOORMAN_SERVICE = 'doorman-test-rooms';
const env = { ...process.env };
const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');
const rnd = () => Math.random().toString(36).slice(2, 10);
const KEY = { own: 'sk_test_OWN_' + rnd(), acme: 'sk_test_ACME_' + rnd(), bloom: 'sk_test_BLOOM_' + rnd(), bloomResend: 're_BLOOM_' + rnd() + rnd() };
const P = (n) => path.join(HOME, 'projects', n);
let vault, rooms, api, apiUrl, client, seen = [];

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: r.content.map((c) => c.text).join(''), isError: !!r.isError };
};

before(async () => {
  vault = await import('../src/vault.js');
  rooms = await import('../src/rooms.js');
  for (const n of ['acme-site/src', 'bloom-app', 'side-project', 'marker-proj/deep']) fs.mkdirSync(P(n), { recursive: true });
  const hosts = ['127.0.0.1'];
  await vault.saveSecret({ name: 'stripe', value: KEY.own, allowedHosts: hosts, allowCommands: true, envName: 'STRIPE_SECRET_KEY' });
  await vault.saveSecret({ name: 'stripe', room: 'Acme Corp', value: KEY.acme, allowedHosts: hosts, allowCommands: true, envName: 'STRIPE_SECRET_KEY' });
  await vault.saveSecret({ name: 'stripe', room: 'Bloom Co', value: KEY.bloom, allowedHosts: hosts, allowCommands: true, envName: 'STRIPE_SECRET_KEY' });
  await vault.saveSecret({ name: 'resend', room: 'Bloom Co', value: KEY.bloomResend, allowedHosts: hosts });
  vault.linkFolder(vault.findRoom('Acme Corp').id, P('acme-site'));
  vault.linkFolder(vault.findRoom('Bloom Co').id, P('bloom-app'));
  fs.writeFileSync(path.join(P('marker-proj'), '.doorman'), 'client: Acme Corp\n');

  api = http.createServer((req, res) => { seen.push(req.headers.authorization); res.end(JSON.stringify({ youSent: req.headers.authorization })); });
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  apiUrl = `http://127.0.0.1:${api.address().port}/v1/charges`;
  client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], env }));
});

after(async () => {
  await client?.close();
  api?.close();
  for (const s of vault.listSecrets()) await vault.deleteSecret(s.id);
  fs.rmSync(HOME, { recursive: true, force: true });
});

test('the same name means each client\'s own key in their project', () => {
  assert.equal(rooms.resolveRef('stripe', P('acme-site/src')).meta.id, 'acme-corp/stripe', 'subfolders count too');
  assert.equal(rooms.resolveRef('stripe', P('bloom-app')).meta.id, 'bloom-co/stripe');
  assert.equal(rooms.resolveRef('stripe', P('side-project')).meta.id, 'stripe', 'unlinked folder uses your own key');
  assert.equal(rooms.resolveRef('stripe', P('marker-proj/deep')).meta.id, 'acme-corp/stripe', 'a .doorman file links a folder too');
});

test("another client's key can never be used in a project", () => {
  const r = rooms.resolveRef('bloom-co/stripe', P('acme-site'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /another client's key/);
  const r2 = rooms.resolveRef('resend', P('acme-site'));
  assert.equal(r2.ok, false, "Bloom's resend key is not handed out in Acme's project");
  assert.match(r2.reason, /Acme Corp has no "resend" key/);
});

test('Doorman refuses to guess the client in an unlinked folder', () => {
  const r = rooms.resolveRef('resend', P('side-project'));
  assert.equal(r.ok, false);
  assert.equal(r.needsLink, true);
  assert.match(r.reason, /Ask the user which client/);
});

test('the AI sees only this project\'s keys, and the right key is sent', async () => {
  const list = await call('list_secrets', { project_dir: P('acme-site') });
  assert.match(list.text, /Client: Acme Corp/);
  assert.match(list.text, /\{\{doorman:stripe\}\}\s+\(Acme Corp's key\)/);
  assert.match(list.text, /not available in this project: Bloom Co/);
  assert.ok(!list.text.includes('resend'), "Bloom's key names are not listed in Acme's project");

  const a = await call('http_request', { url: apiUrl, headers: { Authorization: 'Bearer {{doorman:stripe}}' }, project_dir: P('acme-site') });
  assert.equal(seen.at(-1), 'Bearer ' + KEY.acme);
  const b = await call('http_request', { url: apiUrl, headers: { Authorization: 'Bearer {{doorman:stripe}}' }, project_dir: P('bloom-app') });
  assert.equal(seen.at(-1), 'Bearer ' + KEY.bloom);
  for (const r of [a, b]) assert.ok(!Object.values(KEY).some((k) => r.text.includes(k)), 'no key is ever shown to the AI');

  const blocked = await call('http_request', { url: apiUrl, headers: { Authorization: '{{doorman:resend}}' }, project_dir: P('side-project') });
  assert.ok(blocked.isError);
  assert.match(blocked.text, /link_project/);
});

test('doorman run uses the client of the folder it runs in', () => {
  const run = (cwd) => spawnSync(process.execPath, [cli, 'run', '--', process.execPath, '-e', 'console.log(process.env.STRIPE_SECRET_KEY === process.argv[1] ? "acme" : process.env.STRIPE_SECRET_KEY === process.argv[2] ? "bloom" : process.env.STRIPE_SECRET_KEY === process.argv[3] ? "own" : "none")', KEY.acme, KEY.bloom, KEY.own], { env, cwd, encoding: 'utf8' });
  assert.match(run(P('acme-site/src')).stdout, /acme/);
  assert.match(run(P('bloom-app')).stdout, /bloom/);
  assert.match(run(P('side-project')).stdout, /own/);
});

test('notes: Doorman suggests the client from the title, and imports into that room', async () => {
  const { suggestClient, importKeys } = await import('../src/importer.js');
  assert.equal(suggestClient('Acme Corp\nStripe: sk_live_x'), 'Acme Corp');
  assert.equal(suggestClient('Client: Bloom Co\nStripe: sk_live_x'), 'Bloom Co');
  assert.equal(suggestClient('Northwind — API keys\nOpenAI: sk-x'), 'Northwind');
  assert.equal(suggestClient('My API keys\nStripe: sk_live_x'), '', 'a generic title is not a client');
  assert.equal(suggestClient('Stripe\nsk_live_FAKE51Habc123def456'), '', 'a service name is not a client');
  const saved = await importKeys('Northwind\nOpenAI: sk-proj-FAKE' + rnd() + rnd(), [{ key: 'OPENAI_API_KEY', name: 'openai' }], 'Northwind');
  assert.deepEqual(saved, ['northwind/openai']);
  assert.equal(vault.findRoom('northwind').label, 'Northwind');
});

test("a client's note gets short names even when you have a key with that name", async () => {
  const { previewImport } = await import('../src/importer.js');
  const { items } = previewImport('Globex\nStripe: sk_live_FAKE' + rnd() + rnd(), 'Globex');
  assert.equal(items[0].name, 'stripe', 'not stripe_api_key just because your own "stripe" exists');
});

test("your own key never stands in for a client's key for the same service", async () => {
  // Globex's Stripe key is filed under a different name, with the same env var.
  await vault.saveSecret({ name: 'stripe_live', room: 'Globex', value: 'sk_live_GLOBEX_' + rnd(), allowedHosts: ['127.0.0.1'], allowCommands: true, envName: 'STRIPE_SECRET_KEY' });
  fs.mkdirSync(P('globex-shop'), { recursive: true });
  vault.linkFolder(vault.findRoom('Globex').id, P('globex-shop'));
  const r = rooms.resolveRef('stripe', P('globex-shop'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /use \{\{doorman:stripe_live\}\}/);
  const { usable } = rooms.keysForProject(P('globex-shop'));
  assert.deepEqual(usable.filter((s) => s.envName === 'STRIPE_SECRET_KEY').map((s) => s.id), ['globex/stripe_live'],
    'doorman run gets only Globex\'s key for STRIPE_SECRET_KEY');
});
