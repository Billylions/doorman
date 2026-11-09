// Doorman MCP server. Exposes tools that let an AI use secrets by
// placeholder. Secret values are never returned to the AI.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn, execFile } from 'node:child_process';
import { z } from 'zod';
import * as vault from './vault.js';
import { findPlaceholders, fill, hostAllowed, makeRedactor, placeholder } from './inject.js';
import { resolveRefs, keysForProject, projectRoom } from './rooms.js';
import { startUi, openBrowser } from './ui.js';

const MAX_BODY = 50_000;
const text = (s) => ({ content: [{ type: 'text', text: s }] });
const fail = (s) => ({ content: [{ type: 'text', text: s }], isError: true });

// Sent to every AI client when it connects, so the model knows how to use
// Doorman without the user having to explain it.
export const INSTRUCTIONS = `Doorman holds the user's API keys, tokens and passwords. You can use them without ever seeing them.

Rules:
- Never ask the user to paste an API key, token or password into the chat, and never print, log or write one to a file.
- Before asking for any credential, call list_secrets with project_dir set to the folder you are working in. It tells you which client this project belongs to and which keys you may use here.
- To use a key, put its placeholder {{doorman:NAME}} where the key would go:
  - http_request: in the url, headers or body. Any https host works (for example the API itself, or the user's n8n or Zapier when saving the key as a credential there), unless the user locked the key to specific hosts.
  - run_command: in a shell command; it becomes an environment variable, so it never appears in the command text.
- Just do the task. Don't ask the user to approve hosts, change key settings or confirm steps in Doorman; only stop when Doorman actually refuses.
  Always pass project_dir (your working folder) to these tools.
- The user works for several clients. Each client has a "room" of keys, and project folders are linked to a room. In a linked project, {{doorman:stripe}} automatically means that client's stripe key; never try to use another client's keys.
- If Doorman says a folder isn't linked to a client, ask the user which client the project is for, then call link_project. The user confirms it in Doorman. Never guess the client.
- If the key you need is missing, call request_secret with a short name, what it is for, the API host it will be sent to, where the user can get it, and project_dir. Doorman opens a check-in card for the user and tells you when it is saved.
- If Doorman refuses because the user locked a key or turned off commands for it, that was the user's explicit choice: don't work around it, tell them in one line.
- When you write code or config for the user, refer to keys by environment variable name (e.g. process.env.STRIPE_SECRET_KEY), never by value. The user runs it with: doorman run -- <command> (from the project folder, so the right client's keys are used).`;

const projectDirArg = z.string().optional().describe('The folder you are working in (your current working directory). Doorman uses it to pick the right client\'s keys.');

/** Load every stored value (by id) so outputs can be scrubbed of ANY known secret. */
async function loadAll() {
  const values = {};
  for (const s of vault.listSecrets()) {
    try { values[s.id] = await vault.revealSecret(s.id); } catch { /* missing in keychain */ }
  }
  return values;
}

function truncate(s) {
  return s.length > MAX_BODY ? s.slice(0, MAX_BODY) + `\n…[truncated ${s.length - MAX_BODY} chars]` : s;
}

function describeHere(here, dir) {
  if (!here) return `Project folder: ${dir}\nClient: none (this folder isn't linked to a client, so only the user's own keys are available).`;
  if (here.room === vault.OWN) return `Project folder: ${dir}\nClient: none, this is the user's own project (linked at ${here.folder}).`;
  return `Project folder: ${dir}\nClient: ${here.label} (linked at ${here.folder}${here.via === 'file' ? ' by a .doorman file' : ''}).`;
}

export function buildServer() {
  const server = new McpServer({ name: 'doorman', version: '0.3.0' }, { instructions: INSTRUCTIONS });

  server.registerTool('list_secrets', {
    title: 'List the keys you may use here',
    description: 'List the API keys you may use in this project: names, which client they belong to, allowed hosts and the ' +
      'placeholder to use. Also says which client the project folder is linked to. Never returns the secret values.',
    inputSchema: { project_dir: projectDirArg },
  }, async ({ project_dir }) => {
    const dir = project_dir || process.cwd();
    const { here, usable, others } = keysForProject(dir);
    const lines = [describeHere(here, dir), ''];
    if (!usable.length) lines.push('No keys available in this project. Use request_secret to ask the user to add one.');
    else {
      lines.push('Keys you may use here (put the placeholder where the key goes; Doorman injects the real value):');
      for (const s of usable) {
        lines.push(`- ${placeholder(s.ref)}  ${s.owner === 'you' ? "(the user's own key)" : `(${s.owner}'s key)`}${s.description ? ' — ' + s.description : ''}`);
        lines.push(s.lockHosts
          ? `    hosts: only ${s.allowedHosts.join(', ')} (locked by the user)`
          : `    hosts: any https host${s.allowedHosts.length ? ` (usually ${s.allowedHosts.join(', ')})` : ''}`);
        lines.push(`    shell commands: ${s.allowCommands ? `allowed (env var for code: ${vault.envNameOf(s)})` : 'turned off by the user'}`);
      }
    }
    if (others.length) {
      lines.push('', `Other clients' keys are not available in this project: ${others.map((r) => `${r.label} (${r.keys})`).join(', ')}.`);
      if (!here) lines.push('If this project belongs to one of those clients, ask the user which one and call link_project.');
    }
    return text(lines.join('\n'));
  });

  server.registerTool('http_request', {
    title: 'HTTP request with secrets',
    description: 'Make an HTTP request. Put {{doorman:NAME}} placeholders in the url, headers or body and ' +
      'Doorman injects the real secret (the right client\'s key for this project). Any https host works unless the ' +
      'user locked the key to specific hosts. Secret values are scrubbed from the response. Redirects are not followed.',
    inputSchema: {
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
      url: z.string().describe('Full URL, e.g. https://api.stripe.com/v1/customers'),
      headers: z.record(z.string()).optional().describe('e.g. {"Authorization": "Bearer {{doorman:stripe}}"}'),
      body: z.string().optional().describe('Raw request body (JSON string, form-encoded, etc).'),
      project_dir: projectDirArg,
    },
  }, async ({ method = 'GET', url, headers = {}, body, project_dir }) => {
    const dir = project_dir || process.cwd();
    const headerText = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n');
    const refs = findPlaceholders(url, headerText, body);
    const { metas, error } = resolveRefs(refs, dir);
    if (error) return fail(error);

    let parsed;
    try {
      parsed = new URL(fill(url, Object.fromEntries(refs.map((n) => [n, 'x']))));
      const alt = new URL(fill(url, Object.fromEntries(refs.map((n) => [n, 'y']))));
      if (alt.origin !== parsed.origin) return fail('Placeholders are not allowed in the URL host.');
    } catch { return fail('Invalid URL.'); }
    const host = parsed.hostname;
    const local = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (refs.length && parsed.protocol !== 'https:' && !local) {
      return fail('Secrets are only sent over https.');
    }
    const ids = refs.map((r) => metas[r].id);
    for (const m of Object.values(metas)) {
      if (m.lockHosts && m.allowedHosts.length && !hostAllowed(host, m.allowedHosts)) {
        vault.audit({ tool: 'http_request', secrets: ids, host, blocked: true });
        return fail(`Blocked: the user locked "${m.name}" to ${m.allowedHosts.join(', ')}, so it can't go to ${host}.`);
      }
    }

    const all = await loadAll();
    const values = Object.fromEntries(refs.map((r) => [r, all[metas[r].id]]));
    const redact = makeRedactor(all);
    const realHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, fill(v, values)]));

    let res;
    try {
      res = await fetch(fill(url, values), {
        method,
        headers: realHeaders,
        body: ['GET', 'HEAD'].includes(method) ? undefined : fill(body, values),
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      vault.audit({ tool: 'http_request', secrets: ids, host, error: true });
      return fail('Request failed: ' + redact(String(e?.cause?.message || e?.message || e)));
    }
    if (ids.length) vault.markUsed(ids);
    vault.audit({ tool: 'http_request', secrets: ids, method, host, path: parsed.pathname, status: res.status });

    const keep = ['content-type', 'location', 'x-request-id', 'retry-after', 'ratelimit-remaining', 'x-ratelimit-remaining'];
    const shownHeaders = keep.filter((h) => res.headers.get(h)).map((h) => `${h}: ${res.headers.get(h)}`).join('\n');
    const resBody = method === 'HEAD' ? '' : await res.text();
    return text(redact(`HTTP ${res.status} ${res.statusText}\n${shownHeaders}\n\n${truncate(resBody)}`));
  });

  server.registerTool('run_command', {
    title: 'Run a shell command with secrets',
    description: 'Run a shell command with {{doorman:NAME}} placeholders. Each placeholder becomes an ' +
      'environment variable reference, so the value never appears in the command text. ' +
      'Only works for keys where the user allowed commands. Output is scrubbed of secret values.',
    inputSchema: {
      command: z.string().describe('e.g. curl -s -H "Authorization: Bearer {{doorman:github}}" https://api.github.com/user'),
      cwd: z.string().optional().describe('Folder to run in. Also used to pick the right client\'s keys.'),
      project_dir: projectDirArg,
      timeout_seconds: z.number().int().min(1).max(600).default(60),
    },
  }, async ({ command, cwd, project_dir, timeout_seconds = 60 }) => {
    const dir = project_dir || cwd || process.cwd();
    const refs = findPlaceholders(command);
    const { metas, error } = resolveRefs(refs, dir);
    if (error) return fail(error);
    const denied = Object.values(metas).filter((m) => !m.allowCommands).map((m) => m.name);
    if (denied.length) {
      return fail(`The user turned off commands for: ${denied.join(', ')}. Use http_request for those keys instead.`);
    }

    const all = await loadAll();
    const redact = makeRedactor(all);
    const envName = (ref) => 'DOORMAN_' + ref.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const env = vault.childEnv();
    for (const r of refs) env[envName(r)] = all[metas[r].id];
    const shellCmd = fill(command, Object.fromEntries(refs.map((r) => [r, `"$${envName(r)}"`])));
    const ids = refs.map((r) => metas[r].id);

    const result = await new Promise((resolve) => {
      const child = spawn('/bin/sh', ['-c', shellCmd], { cwd: cwd || undefined, env, timeout: timeout_seconds * 1000 });
      let out = '';
      const add = (d) => { if (out.length < MAX_BODY * 2) out += d; };
      child.stdout.on('data', add);
      child.stderr.on('data', add);
      child.on('error', (e) => resolve({ code: -1, out: out + String(e) }));
      child.on('close', (code, signal) => resolve({ code, signal, out }));
    });
    if (ids.length) vault.markUsed(ids);
    vault.audit({ tool: 'run_command', secrets: ids, exit: result.code });
    const status = result.signal ? `killed (${result.signal})` : `exit ${result.code}`;
    return text(redact(`${status}\n${truncate(result.out)}`));
  });

  let ui = null;
  async function openInDoorman(path, params) {
    // Prefer the Doorman Mac app (doorman:// link); fall back to a local browser page.
    const deep = `doorman://${path}?` + new URLSearchParams(params);
    const openedApp = await new Promise((resolve) => execFile('open', [deep], (err) => resolve(!err)));
    if (openedApp) return;
    if (!ui) ui = await startUi({ port: 0 });
    const q = new URLSearchParams(path === 'add'
      ? { add: params.name, desc: params.desc, hosts: params.hosts, hint: params.hint, room: params.room }
      : { link: params.folder, client: params.client });
    openBrowser(`${ui.url}&${q}`);
  }
  const waitFor = async (check) => {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const v = check();
      if (v) return v;
    }
    return null;
  };

  server.registerTool('request_secret', {
    title: 'Ask the user to add a key',
    description: 'Ask the user to add an API key to Doorman. Opens the Doorman app with a pre-filled ' +
      'check-in card for this project\'s client; the user pastes the key there (never in chat). Waits up to ~90s for it.',
    inputSchema: {
      name: z.string().regex(vault.NAME_RE).describe('Short name, e.g. "stripe" or "openai"'),
      description: z.string().optional().describe('What it is for, e.g. "Stripe test-mode secret key"'),
      allowed_hosts: z.array(z.string()).optional().describe('Hosts the key may be sent to, e.g. ["api.stripe.com"]'),
      where_to_get_it: z.string().optional().describe('URL or hint where the user can find this key'),
      project_dir: projectDirArg,
    },
  }, async ({ name, description = '', allowed_hosts = [], where_to_get_it = '', project_dir }) => {
    const here = projectRoom(project_dir || process.cwd());
    const room = here ? here.room : vault.OWN;
    const label = here ? here.label : 'your own keys';
    const id = vault.makeId(room, name);
    if (vault.getSecretMeta(id)) return text(`"${name}" already exists for ${label}. Use ${placeholder(name)}.`);
    const startedAt = Date.now();
    try {
      await openInDoorman('add', { name, desc: description, hosts: allowed_hosts.join(', '), hint: where_to_get_it, room: here ? here.label : '' });
    } catch (e) {
      return fail('Could not open Doorman: ' + e.message + `. Ask the user to run: doorman add ${name}`);
    }
    const saved = await waitFor(() => {
      if (vault.getSecretMeta(id)) return id;
      // The user may have filed it under a different client on the card.
      const any = vault.listSecrets().find((s) => s.name === name && Date.parse(s.updatedAt) >= startedAt);
      return any ? any.id : null;
    });
    if (!saved) {
      return text(`Opened Doorman for the user to add "${name}", but it is not saved yet. ` +
        'Tell the user to paste the key in the Doorman window that opened (not in chat), then call list_secrets.');
    }
    const meta = vault.getSecretMeta(saved);
    const owner = meta.room === vault.OWN ? 'their own keys' : vault.getRoom(meta.room)?.label;
    const elsewhere = meta.room !== room && meta.room !== vault.OWN;
    return text(`The user added "${name}" for ${owner}. ` + (elsewhere
      ? `It was filed under a different client than this project, so it can't be used here. Ask the user about it.`
      : `Use ${placeholder(name)}.`));
  });

  server.registerTool('link_project', {
    title: 'Link this project to a client',
    description: 'Link the project folder to one of the user\'s clients (or to the user\'s own keys), so the right ' +
      'client\'s keys are used here. The user confirms it in Doorman; never call this on a guess, ask the user first.',
    inputSchema: {
      client: z.string().min(1).describe('The client name the user told you, e.g. "Acme Corp", or "mine" for the user\'s own project'),
      project_dir: projectDirArg,
    },
  }, async ({ client, project_dir }) => {
    const dir = project_dir || process.cwd();
    const current = projectRoom(dir);
    const target = vault.findRoom(client);
    if (current && target && current.room === target.id) return text(`This project is already linked to ${target.label}.`);
    try {
      await openInDoorman('link', { folder: dir, client });
    } catch (e) {
      return fail('Could not open Doorman: ' + e.message + `. Ask the user to run: doorman link "${client}" (in ${dir})`);
    }
    const linked = await waitFor(() => {
      const now = projectRoom(dir);
      return now && (!current || now.room !== current.room || now.folder !== current.folder) ? now : null;
    });
    if (!linked) return text('Opened Doorman so the user can confirm the link, but it has not been confirmed yet. Ask the user to confirm it in the Doorman window.');
    return text(`Linked. This project belongs to ${linked.room === vault.OWN ? "the user's own keys" : linked.label}. Call list_secrets to see the keys you may use here.`);
  });

  return server;
}

export async function runMcp() {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}
