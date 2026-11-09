// End-to-end: real MCP client <-> Doorman MCP server over stdio, a real
// Keychain item (isolated service name), and a local echo API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SECRET = 'sk_test_DOORMAN_e2e_' + Math.random().toString(36).slice(2);
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-test-'));
const env = { ...process.env, DOORMAN_HOME: HOME, DOORMAN_SERVICE: 'doorman-test' };
process.env.DOORMAN_HOME = HOME;
process.env.DOORMAN_SERVICE = 'doorman-test';
const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');

let api, apiUrl, client, vault, seen = [];

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: r.content.map((c) => c.text).join(''), isError: !!r.isError };
};

before(async () => {
  vault = await import('../src/vault.js');
  await vault.saveSecret({ name: 'demo', value: SECRET, description: 'Echo API key', allowedHosts: ['127.0.0.1'], lockHosts: true, allowCommands: false });
  await vault.saveSecret({ name: 'open', value: SECRET + '_open', allowedHosts: ['api.example.com'] });
  await vault.saveSecret({ name: 'shell', value: SECRET + '_sh', allowedHosts: [], allowCommands: true });

  // Echo API: returns what it received (including the key), like a leaky API would.
  api = http.createServer((req, res) => {
    seen.push(req.headers.authorization);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ youSent: req.headers.authorization, ok: true }));
  });
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  apiUrl = `http://127.0.0.1:${api.address().port}/v1/me`;

  client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], env }));
});

after(async () => {
  await client?.close();
  api?.close();
  await vault.deleteSecret('demo');
  await vault.deleteSecret('shell');
  await vault.deleteSecret('open');
  fs.rmSync(HOME, { recursive: true, force: true });
});

test('list_secrets shows names but never values', async () => {
  const r = await call('list_secrets', {});
  assert.match(r.text, /\{\{doorman:demo\}\}/);
  assert.ok(!r.text.includes(SECRET));
});

test('http_request injects the key and scrubs it from the response', async () => {
  const r = await call('http_request', { url: apiUrl, headers: { Authorization: 'Bearer {{doorman:demo}}' } });
  assert.equal(seen.at(-1), 'Bearer ' + SECRET, 'API received the real key');
  assert.match(r.text, /HTTP 200/);
  assert.match(r.text, /\[doorman:demo\]/);
  assert.ok(!r.text.includes(SECRET), 'AI never sees the key');
});

test('a key the user did not lock goes to any host the AI needs', async () => {
  const r = await call('http_request', { url: apiUrl, headers: { Authorization: 'Bearer {{doorman:open}}' } });
  assert.ok(!r.isError, r.text);
  assert.equal(seen.at(-1), 'Bearer ' + SECRET + '_open');
  assert.ok(!r.text.includes(SECRET + '_open'));
});

test('http_request blocks hosts the user locked the key away from', async () => {
  const r = await call('http_request', { url: 'https://example.com/', headers: { Authorization: '{{doorman:demo}}' } });
  assert.ok(r.isError);
  assert.match(r.text, /Blocked/);
});

test('http_request rejects placeholders in the host', async () => {
  const r = await call('http_request', { url: 'https://{{doorman:demo}}.example.com/' });
  assert.ok(r.isError);
});

test('run_command is refused for secrets without shell permission', async () => {
  const r = await call('run_command', { command: 'echo {{doorman:demo}}' });
  assert.ok(r.isError);
});

test('run_command injects via env and scrubs output, even base64', async () => {
  const r = await call('run_command', { command: 'echo {{doorman:shell}}; printf %s {{doorman:shell}} | base64' });
  assert.ok(!r.isError, r.text);
  assert.ok(!r.text.includes(SECRET), r.text);
  assert.equal(r.text.split('[doorman:shell]').length - 1, 2, r.text);
});

test('audit log records usage without values', () => {
  const raw = fs.readFileSync(path.join(HOME, 'audit.log'), 'utf8');
  assert.match(raw, /"http_request"/);
  assert.match(raw, /"blocked":true/);
  assert.ok(!raw.includes(SECRET));
});
