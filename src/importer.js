// Check keys from a .env file or a pasted note in to Doorman.
import * as vault from './vault.js';
import { parseAny, planImport, toName, guessHosts } from './dotenv.js';

const GENERIC_HEADINGS = /^(my\s+)?(api\s+)?(keys?|tokens?|credentials?|secrets?|passwords?|logins?|notes?|env|dev|prod|production|staging|test|api|apis|access)(\s+(list|notes?|keys?))?$/i;

/**
 * Guess the client a note belongs to from its first line, e.g. "Acme Corp",
 * "Client: Acme Corp" or "Acme Corp — API keys". Returns '' if it looks like
 * a service name (Stripe), a generic title ("API keys") or a key.
 */
export function suggestClient(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  let first = lines[0].replace(/^[#>*•\-\s]+/, '').trim();
  const labelled = first.match(/^(client|customer|company|project|brand|account|for)\s*[:\-–—]\s*(.+)$/i);
  if (labelled) return labelled[2].trim().slice(0, 60);
  first = first.replace(/\s*[\-–—|:(]\s*(api\s+)?(keys?|tokens?|credentials?|secrets?|passwords?)\)?\s*$/i, '').trim();
  if (!first || first.length > 40 || /[=:]/.test(first) || /\d{4,}/.test(first)) return '';
  if (GENERIC_HEADINGS.test(first)) return '';
  if (guessHosts(first.toUpperCase().replace(/[^A-Z0-9]+/g, '_')).length) return '';
  // If the very next line is a lone key, this heading is a service title (like "Resend"), not a client.
  const next = lines[1] || '';
  if (next && !/\s/.test(next) && next.length >= 16) return '';
  return first;
}

export function previewImport(text, room) {
  // A client that doesn't exist yet has no keys, so nothing would be replaced.
  const r = room ? vault.findRoom(room) : vault.getRoom(vault.OWN);
  const names = new Set(r ? vault.listSecrets().filter((s) => s.room === r.id).map((s) => s.name) : []);
  return { items: planImport(text, names), suggestedClient: suggestClient(text) };
}

/**
 * picks: [{ key, name?, title?, hosts?, allowCommands? }]. The values are
 * re-read from the text here, so they never travel through the page or the
 * API response. `room` is a client name or id ("" or "own" = your own keys).
 */
export async function importKeys(text, picks, room) {
  const r = room ? vault.ensureRoom(room) : vault.getRoom(vault.OWN);
  const values = new Map(parseAny(text).map((e) => [e.key, e.value]));
  const saved = [];
  for (const p of picks) {
    const value = values.get(p.key);
    if (!value) continue;
    const name = p.name ? String(p.name) : toName(p.key);
    const s = await vault.saveSecret({
      name,
      room: r.id,
      value,
      description: p.title ? String(p.title).slice(0, 200) : 'Imported',
      allowedHosts: p.hosts ?? guessHosts(p.key),
      allowCommands: p.allowCommands !== false,
      envName: p.key.replace(/[^A-Za-z0-9_]/g, '_'),
    });
    saved.push(s.id);
  }
  if (saved.length) vault.audit({ tool: 'ui_import', secrets: saved, room: r.id });
  return saved;
}
