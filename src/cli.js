#!/usr/bin/env node
import readline from 'node:readline';
import * as vault from './vault.js';
import { placeholder } from './inject.js';
import { setupInfo } from './setup.js';

const HELP = `Doorman: give your AI access without giving it the keys.

Usage:
  doorman run -- <command> [args]     Run a command with your keys as environment variables
      --only stripe,openai              Only these keys
      --env-file .env                   Also load this file; {{doorman:NAME}} in it is filled in
  doorman import --clipboard          Check in keys from a note you copied (titles become names)
      --client "Acme Corp"              Whose keys these are (Doorman suggests one from the note's title)
      --mine                            They're your own keys
  doorman import <file> [--all] [--yes] Check in keys from a .env file or a text file
  doorman add <name> [options]        Add or update a key (prompts for the value)
      --desc "what it's for"
      --hosts api.example.com,*.example.com
      --client "Acme Corp"              Save it for a client (default: your own keys)
      --env STRIPE_SECRET_KEY           Environment variable name for doorman run
      --allow-commands                  Also allow in commands (doorman run, run_command)
  doorman list                        List keys by client (names only, never values)
  doorman link "<client>" [folder]    Link this project folder to a client ("mine" for your own)
  doorman unlink [folder]             Unlink a folder
  doorman where                       Which client this folder belongs to
  doorman rooms                       Your clients, their linked folders and key counts
  doorman rm <name>                   Check out (delete) a key
  doorman log                         Show recent AI usage
  doorman setup                       Show how to connect Claude Code / Cursor
  doorman install-cli                 Put the doorman command on your PATH
  doorman ui                          Open the front desk in your browser
  doorman mcp                         Run the MCP server (used by your AI tool)
`;

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { opts[key] = next; i++; } else opts[key] = true;
    } else pos.push(a);
  }
  return { pos, opts };
}

function askHidden(prompt) {
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      let d = '';
      process.stdin.on('data', (c) => { d += c; });
      process.stdin.on('end', () => resolve(d.replace(/\r?\n$/, '')));
    });
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(prompt)) process.stdout.write(s); };
    rl.question(prompt, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); resolve(/^y(es)?$/i.test(a.trim())); });
  });
}

async function main() {
  const [cmd, ...restAll] = process.argv.slice(2);
  // Everything after "--" belongs to the command being run.
  const dd = restAll.indexOf('--');
  const rest = dd >= 0 ? restAll.slice(0, dd) : restAll;
  const after = dd >= 0 ? restAll.slice(dd + 1) : [];
  const { pos, opts } = parseArgs(rest);

  switch (cmd) {
    case 'run': {
      const { doormanRun } = await import('./run.js');
      const command = after.length ? after : pos;
      const only = typeof opts.only === 'string' ? opts.only.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
      process.exitCode = await doormanRun({ command, only, envFile: typeof opts['env-file'] === 'string' ? opts['env-file'] : undefined });
      return;
    }
    case 'import': {
      const fs = await import('node:fs');
      const { previewImport, importKeys } = await import('./importer.js');
      let text, from;
      if (opts.clipboard) {
        const { execFileSync } = await import('node:child_process');
        text = execFileSync('pbpaste', { encoding: 'utf8' });
        from = 'your clipboard';
      } else if (pos[0] === '-') {
        text = fs.readFileSync(0, 'utf8');
        from = 'stdin';
        if (!opts.yes) throw new Error('Reading from stdin: add --yes, or use --clipboard instead.');
      } else if (pos[0]) {
        text = fs.readFileSync(pos[0], 'utf8');
        from = pos[0];
      } else {
        throw new Error('Usage: doorman import <file>   or   doorman import --clipboard   (copy your note first)');
      }
      const explicit = typeof opts.client === 'string' ? opts.client : opts.mine ? 'own' : null;
      const preview = previewImport(text, explicit);
      let room = explicit;
      if (!room && preview.suggestedClient) {
        if (opts.yes) throw new Error(`This note looks like it's for "${preview.suggestedClient}". Add --client "${preview.suggestedClient}" or --mine.`);
        room = preview.suggestedClient;
      }
      const roomName = !room || room === 'own' ? 'your own keys' : (vault.findRoom(room)?.label || `${room} (new client)`);
      const items = preview.items.filter((i) => !i.empty);
      const picked = items.filter((i) => opts.all || i.secret);
      if (!picked.length) return console.log('No keys found. Lines like "Stripe: sk_live_…" work; for .env files use --all to include every variable.');
      console.log(`Doorman will check in ${picked.length} key(s) from ${from} for ${roomName}:`);
      for (const i of picked) console.log(`  • ${i.name.padEnd(22)} ${i.masked.padEnd(18)} $${i.envName.padEnd(26)} → ${i.hosts.join(', ') || '(no host yet)'}${i.exists ? '  (replaces existing)' : ''}`);
      const skipped = items.length - picked.length;
      if (skipped) console.log(`  (skipping ${skipped} that don't look like keys; use --all to include them)`);
      if (!opts.yes) {
        if (!process.stdin.isTTY) throw new Error('Add --yes to import without a prompt.');
        if (!explicit && room) console.log(`(Doorman guessed the client from the note's title. Use --client "Name" or --mine to choose.)`);
        if (!(await askYesNo(`Check them in for ${roomName}? [y/N] `))) return console.log('Nothing imported.');
      }
      const saved = await importKeys(text, picked.map((i) => ({ key: i.key, name: i.name, title: i.title, hosts: i.hosts })), room === 'own' ? '' : room);
      console.log(`Checked in ${saved.length} key(s).`);
      if (opts.clipboard) {
        const { execFileSync } = await import('node:child_process');
        execFileSync('pbcopy', { input: '' });
        console.log('Cleared your clipboard. You can now delete the keys from your note.');
      }
      console.log('Run your app with them: doorman run -- <your command>');
      return;
    }
    case 'rooms': {
      for (const r of vault.listRooms()) {
        console.log(`${r.id === vault.OWN ? 'Your suite' : r.label}  (${r.keys} key${r.keys === 1 ? '' : 's'})${r.id !== vault.OWN ? '  id: ' + r.id : ''}`);
        for (const f of r.folders) console.log(`    📁 ${f}`);
      }
      return;
    }
    case 'link': {
      if (!pos[0]) throw new Error('Usage: doorman link "<client>" [folder]   (use "mine" for your own projects)');
      const room = vault.ensureRoom(pos[0]);
      const r = vault.linkFolder(room.id, pos[1] || process.cwd());
      vault.audit({ tool: 'link_project', room: r.room, folder: r.folder });
      console.log(`Linked ${r.folder} to ${room.id === vault.OWN ? 'your own keys' : room.label}.`);
      console.log(`Here, {{doorman:NAME}} and doorman run use ${room.id === vault.OWN ? 'your own keys' : room.label + "'s keys (then yours if " + room.label + ' has none)'}.`);
      return;
    }
    case 'unlink': {
      const folder = pos[0] || process.cwd();
      console.log(vault.unlinkFolder(folder) ? `Unlinked ${folder}.` : `${folder} wasn't linked. (A parent folder may be; see: doorman where)`);
      return;
    }
    case 'where': {
      const { projectRoom } = await import('./rooms.js');
      const here = projectRoom(pos[0] || process.cwd());
      if (!here) console.log('This folder is not linked to a client, so only your own keys are used here.\nLink it: doorman link "<client>"');
      else console.log(`This folder belongs to ${here.room === vault.OWN ? 'your own keys' : here.label} (linked at ${here.folder}${here.via === 'file' ? ' by a .doorman file' : ''}).`);
      return;
    }
    case 'install-cli': {
      const { installCli } = await import('./installcli.js');
      const r = installCli();
      console.log(`Installed ${r.target}`);
      if (!r.onPath) console.log(`Add this to your shell profile so you can type "doorman":\n  export PATH="${r.dir}:$PATH"`);
      return;
    }
    case 'mcp': {
      const { runMcp } = await import('./mcp.js');
      await runMcp();
      return;
    }
    case 'ui': {
      const { startUi, openBrowser } = await import('./ui.js');
      const ui = await startUi({ port: Number(opts.port) || 0 });
      console.log(`Doorman is open: ${ui.url}\nPress Ctrl+C to close.`);
      if (!opts['no-open']) openBrowser(ui.url);
      return;
    }
    case 'add': {
      const name = pos[0];
      vault.validateName(name);
      const room = typeof opts.client === 'string' ? vault.ensureRoom(opts.client).id : vault.OWN;
      const existing = vault.getSecretMeta(vault.makeId(room, name));
      const value = await askHidden(existing ? `New value for ${name} (Enter to keep current): ` : `Paste the key for ${name}: `);
      const saved = await vault.saveSecret({
        name,
        room,
        value: value.trim(),
        description: opts.desc ?? existing?.description,
        allowedHosts: opts.hosts ?? existing?.allowedHosts,
        allowCommands: opts['no-commands'] ? false : (existing?.allowCommands ?? true),
        lockHosts: opts['lock-hosts'] ? true : (opts.hosts ? false : existing?.lockHosts),
        envName: typeof opts.env === 'string' ? opts.env : undefined,
      });
      console.log(`Saved "${name}" for ${room === vault.OWN ? 'your own keys' : vault.getRoom(room).label}. Your AI uses it as ${placeholder(name)}`);
      if (saved.lockHosts) console.log(`Locked to ${saved.allowedHosts.join(', ')}.`);
      return;
    }
    case 'list': {
      const list = vault.listSecrets();
      if (!list.length) return console.log('No keys yet. Run: doorman add <name>  or  doorman import --clipboard');
      for (const r of vault.listRooms()) {
        const keys = list.filter((s) => s.room === r.id);
        if (!keys.length) continue;
        console.log(`\n${r.id === vault.OWN ? 'Your suite (your own keys)' : r.label}${r.folders.length ? '   linked: ' + r.folders.join(', ') : ''}`);
        for (const s of keys) {
          console.log(`  • ${s.name}${s.description ? ' — ' + s.description : ''}`);
          console.log(`      ${placeholder(s.name)}  hosts: ${s.lockHosts ? 'only ' + s.allowedHosts.join(', ') : 'any' + (s.allowedHosts.length ? ' (usually ' + s.allowedHosts.join(', ') + ')' : '')}  commands: ${s.allowCommands ? '$' + vault.envNameOf(s) : 'off'}${s.room !== vault.OWN ? '   id: ' + s.id : ''}`);
        }
      }
      return;
    }
    case 'rm': {
      await vault.deleteSecret(pos[0]);
      vault.audit({ tool: 'ui_checkout', secrets: [pos[0]] });
      console.log(`Checked out "${pos[0]}".`);
      return;
    }
    case 'log': {
      for (const e of vault.readAudit(Number(opts.n) || 30)) {
        const where = e.host ? ` → ${e.host}${e.path || ''}` : '';
        const res = e.blocked ? ' BLOCKED' : e.status ? ` ${e.status}` : e.exit != null ? ` exit ${e.exit}` : '';
        console.log(`${e.at}  ${e.tool} [${(e.secrets || []).join(', ')}]${where}${res}`);
      }
      return;
    }
    case 'setup': {
      const s = setupInfo();
      console.log('Claude Code (run once):\n\n  ' + s.claudeCode + '\n');
      console.log('Cursor (~/.cursor/mcp.json) or Claude Desktop config:\n\n' + s.cursorJson);
      return;
    }
    default:
      console.log(HELP);
  }
}

main().catch((e) => {
  console.error('doorman: ' + e.message);
  process.exit(1);
});
