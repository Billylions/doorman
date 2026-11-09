// Put a `doorman` command on the user's PATH (in ~/.local/bin, no admin needed).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function installCli(dir = path.join(os.homedir(), '.local', 'bin')) {
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.js');
  // Inside Doorman.app, use the app's own binary as Node so no Node install is needed.
  const inApp = Boolean(process.versions.electron);
  const script = inApp
    ? `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "${cli}" "$@"\n`
    : `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`;
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'doorman');
  fs.writeFileSync(target, script, { mode: 0o755 });
  fs.chmodSync(target, 0o755);
  const onPath = (process.env.PATH || '').split(':').includes(dir);
  return { target, onPath, dir };
}
