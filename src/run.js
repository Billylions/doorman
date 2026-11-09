// `doorman run -- <command>`: run any program with your keys as environment
// variables, without a .env file and without the keys appearing in the command.
// Run it from a project folder and you get that client's keys.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import * as vault from './vault.js';
import { parseDotenv } from './dotenv.js';
import { findPlaceholders, fill, makeRedactor } from './inject.js';
import { keysForProject, resolveRefs } from './rooms.js';

function notAllowed(names) {
  return new Error(`Not allowed in commands: ${names.join(', ')}. Turn on "Allow in commands" ` +
    'for these keys in Doorman (More options on the check-in card), then try again.');
}

/**
 * Build the environment for a command run in `projectDir`.
 * - Keys usable in this project (this client's, then your own) with "allow in
 *   commands" on are set as their env var names. `only` narrows that down.
 * - With an env file, its values are used too, and {{doorman:NAME}}
 *   placeholders in it are filled in.
 */
export async function buildRunEnv({ only, envFile, projectDir = process.cwd() } = {}) {
  const { here, usable } = keysForProject(projectDir);
  let chosen = usable.filter((s) => s.allowCommands);
  if (only?.length) {
    const { metas, error } = resolveRefs(only, projectDir);
    if (error) throw new Error(error);
    const denied = Object.values(metas).filter((m) => !m.allowCommands).map((m) => m.name);
    if (denied.length) throw notAllowed(denied);
    chosen = Object.values(metas);
  }

  const values = {};
  for (const s of vault.listSecrets()) {
    try { values[s.id] = await vault.revealSecret(s.id); } catch { /* missing in keychain */ }
  }

  const env = vault.childEnv();
  const used = new Set();
  for (const s of chosen) {
    if (values[s.id] == null) continue;
    env[vault.envNameOf(s)] = values[s.id];
    used.add(s.id);
  }

  if (envFile) {
    for (const { key, value } of parseDotenv(fs.readFileSync(envFile, 'utf8'))) {
      const refs = findPlaceholders(value);
      const { metas, error } = resolveRefs(refs, projectDir);
      if (error) throw new Error(`${envFile}: ${error}`);
      const denied = Object.values(metas).filter((m) => !m.allowCommands).map((m) => m.name);
      if (denied.length) throw notAllowed(denied);
      env[key] = fill(value, Object.fromEntries(refs.map((r) => [r, values[metas[r].id]])));
      refs.forEach((r) => used.add(metas[r].id));
    }
  }
  return { env, used: [...used], here, redact: makeRedactor(values) };
}

/**
 * Run the command. When a person runs it in a terminal, output goes straight
 * through. When something captures the output (an AI agent, a script, a pipe),
 * known key values are scrubbed from it.
 */
export async function doormanRun({ command, only, envFile, projectDir = process.cwd(), stdoutIsTTY = process.stdout.isTTY }) {
  if (!command.length) throw new Error('Nothing to run. Usage: doorman run -- <command> [args]');
  const { env, used, here, redact } = await buildRunEnv({ only, envFile, projectDir });
  if (process.stderr.isTTY) {
    const who = here && here.room !== vault.OWN ? `${here.label}'s keys` : 'your own keys';
    process.stderr.write(`doorman: using ${who} (${used.length})\n`);
  }
  if (!used.length) {
    process.stderr.write('doorman: no keys are allowed in commands here, so none were added. ' +
      'Turn on "Allow in commands" for a key in Doorman, or link this folder to a client: doorman link "<client>"\n');
  }

  const scrub = !stdoutIsTTY;
  const child = spawn(command[0], command.slice(1), { env, stdio: scrub ? ['inherit', 'pipe', 'pipe'] : 'inherit' });
  if (scrub) {
    // Redact line by line so a key split across two chunks is still caught.
    const pipe = (from, to) => {
      let buf = '';
      from.setEncoding('utf8');
      from.on('data', (d) => {
        buf += d;
        const cut = buf.lastIndexOf('\n');
        if (cut >= 0) { to.write(redact(buf.slice(0, cut + 1))); buf = buf.slice(cut + 1); }
      });
      from.on('end', () => { if (buf) to.write(redact(buf)); });
    };
    pipe(child.stdout, process.stdout);
    pipe(child.stderr, process.stderr);
  }

  const code = await new Promise((resolve) => {
    child.on('error', (e) => { process.stderr.write(`doorman: ${e.message}\n`); resolve(127); });
    child.on('close', (c, signal) => resolve(signal ? 1 : c));
  });
  if (used.length) vault.markUsed(used);
  vault.audit({ tool: 'doorman_run', secrets: used, exit: code });
  return code;
}
