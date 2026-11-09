// Snippets for connecting Doorman to AI tools.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Homebrew's execPath is versioned (…/Cellar/node/23.4.0/bin/node) and
// breaks on upgrade; prefer the stable symlink when it exists.
function stableNode() {
  const p = process.execPath;
  const m = p.match(/^(.*)\/Cellar\/node(?:@\d+)?\/[^/]+\/bin\/node$/);
  if (m && fs.existsSync(`${m[1]}/bin/node`)) return `${m[1]}/bin/node`;
  return p;
}

export function setupInfo() {
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.js');
  // Inside Doorman.app, the app's own binary runs the MCP server as plain
  // Node (ELECTRON_RUN_AS_NODE), so users don't need Node installed.
  const inApp = Boolean(process.versions.electron) && !process.env.ELECTRON_RUN_AS_NODE;
  const command = inApp ? process.execPath : stableNode();
  const env = inApp ? { ELECTRON_RUN_AS_NODE: '1' } : undefined;
  const server = { command, args: [cli, 'mcp'], ...(env ? { env } : {}) };
  const envFlag = inApp ? ' -e ELECTRON_RUN_AS_NODE=1' : '';
  return {
    claudeCode: `claude mcp add --scope user doorman${envFlag} -- "${command}" "${cli}" mcp`,
    cursorJson: JSON.stringify({ mcpServers: { doorman: server } }, null, 2),
  };
}
