// Vault: secret VALUES live in the macOS Keychain; only metadata
// (name, room, description, allowed hosts) is kept in a plain JSON file.
//
// Rooms: every key belongs to a room. "own" is the user's own keys ("Your
// suite"); every client gets a room of their own. Project folders are linked
// to a room, so {{doorman:stripe}} means "this client's stripe key".
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

export const HOME = process.env.DOORMAN_HOME || path.join(os.homedir(), '.doorman');
const SERVICE = process.env.DOORMAN_SERVICE || 'doorman';
const META_FILE = path.join(HOME, 'vault.json');
const AUDIT_FILE = path.join(HOME, 'audit.log');

export const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const ROOM_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** A key's full id: "stripe" (your own) or "acme/stripe" (a client's). */
export const ID_RE = /^(?:[a-z0-9][a-z0-9-]{0,39}\/)?[A-Za-z0-9_-]{1,64}$/;
export const OWN = 'own';
const OWN_LABEL = 'Your suite';

function ensureHome() {
  fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
}

function readMeta() {
  let meta;
  try { meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch { meta = {}; }
  meta.secrets ||= {};
  meta.rooms ||= {};
  meta.rooms[OWN] ||= { id: OWN, label: OWN_LABEL, folders: [] };
  // Keys saved before rooms existed belong to the user.
  for (const [id, s] of Object.entries(meta.secrets)) {
    s.id ||= id;
    s.room ||= OWN;
  }
  // v2: hosts are only a hint unless the user locks them, and keys work in
  // commands unless the user turns that off. Older keys got the strict
  // defaults without the user choosing them, so open them up.
  if ((meta.version || 1) < 2) {
    for (const s of Object.values(meta.secrets)) { s.allowCommands = true; s.lockHosts = false; }
    meta.version = 2;
  }
  return meta;
}

function writeMeta(meta) {
  ensureHome();
  const tmp = META_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, META_FILE);
}

export function validateName(name) {
  if (!NAME_RE.test(name || '')) {
    throw new Error('Name must be 1-64 characters: letters, numbers, "_" or "-".');
  }
}

function validateId(id) {
  if (!ID_RE.test(id || '')) throw new Error(`Not a valid key: "${id}".`);
}

export function makeId(room, name) {
  return !room || room === OWN ? name : `${room}/${name}`;
}

export function normalizeHosts(hosts) {
  const list = Array.isArray(hosts) ? hosts : String(hosts || '').split(/[\s,]+/);
  return [...new Set(list.map((h) => h.trim().toLowerCase()).filter(Boolean)
    .map((h) => h.replace(/^https?:\/\//, '').replace(/\/.*$/, '')))];
}

// ---- Keychain ------------------------------------------------------------

// Pipe the command into `security -i` so the value never appears in
// process arguments (visible to other processes via `ps`). Hex encoding
// avoids any quoting issues.
function keychainWrite(account, value) {
  return new Promise((resolve, reject) => {
    const hex = Buffer.from(value, 'utf8').toString('hex');
    const child = spawn('security', ['-i'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && !err.trim()) resolve();
      else reject(new Error('Keychain write failed: ' + (err.trim() || `exit ${code}`)));
    });
    child.stdin.end(`add-generic-password -U -a "${account}" -s ${SERVICE} -l "Doorman: ${account}" -X ${hex}\n`);
  });
}

async function keychainRead(account) {
  const { stdout } = await run('security', ['find-generic-password', '-a', account, '-s', SERVICE, '-w']);
  return stdout.replace(/\n$/, '');
}

async function keychainDelete(account) {
  try {
    await run('security', ['delete-generic-password', '-a', account, '-s', SERVICE]);
  } catch { /* already gone */ }
}

// ---- Rooms (clients) -----------------------------------------------------

function slug(label) {
  return String(label || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'client';
}

export function listRooms() {
  const meta = readMeta();
  const counts = {};
  for (const s of Object.values(meta.secrets)) counts[s.room] = (counts[s.room] || 0) + 1;
  return Object.values(meta.rooms)
    .map((r) => ({ ...r, folders: r.folders || [], keys: counts[r.id] || 0 }))
    .sort((a, b) => (a.id === OWN ? -1 : b.id === OWN ? 1 : a.label.localeCompare(b.label)));
}

export function getRoom(id) {
  return readMeta().rooms[id] || null;
}

/** Find a room by id or by its label (case-insensitive). */
export function findRoom(idOrLabel) {
  if (!idOrLabel) return null;
  const meta = readMeta();
  const q = String(idOrLabel).trim().toLowerCase();
  if (['own', 'mine', 'me', 'my own', 'your suite', 'personal'].includes(q)) return meta.rooms[OWN];
  return meta.rooms[q] || Object.values(meta.rooms).find((r) => r.label.toLowerCase() === q || r.id === slug(q)) || null;
}

/** Get a room by id or label, creating a client room if it doesn't exist. */
export function ensureRoom(idOrLabel) {
  const found = findRoom(idOrLabel);
  if (found) return found;
  const label = String(idOrLabel || '').trim().slice(0, 60);
  if (!label) return readMeta().rooms[OWN];
  const meta = readMeta();
  let id = slug(label);
  if (id === OWN) id = 'client-own';
  for (let n = 2; meta.rooms[id]; n++) id = `${slug(label)}-${n}`;
  meta.rooms[id] = { id, label, folders: [], createdAt: new Date().toISOString() };
  writeMeta(meta);
  return meta.rooms[id];
}

export function renameRoom(id, label) {
  const meta = readMeta();
  if (!meta.rooms[id]) throw new Error('No such room.');
  meta.rooms[id].label = String(label).trim().slice(0, 60) || meta.rooms[id].label;
  writeMeta(meta);
  return meta.rooms[id];
}

function canonical(dir) {
  const abs = path.resolve(String(dir || '').replace(/^~(?=$|\/)/, os.homedir()));
  try { return fs.realpathSync(abs); } catch { return abs; }
}

/** Link a project folder (and everything inside it) to a room. */
export function linkFolder(roomId, dir) {
  const meta = readMeta();
  const room = meta.rooms[roomId];
  if (!room) throw new Error('No such room.');
  const folder = canonical(dir);
  for (const r of Object.values(meta.rooms)) r.folders = (r.folders || []).filter((f) => f !== folder);
  room.folders = [...(room.folders || []), folder];
  writeMeta(meta);
  return { room: room.id, label: room.label, folder };
}

export function unlinkFolder(dir) {
  const meta = readMeta();
  const folder = canonical(dir);
  let changed = false;
  for (const r of Object.values(meta.rooms)) {
    const before = (r.folders || []).length;
    r.folders = (r.folders || []).filter((f) => f !== folder);
    changed ||= r.folders.length !== before;
  }
  if (changed) writeMeta(meta);
  return changed;
}

/**
 * Which room does this folder belong to? Walks up from the folder: the
 * closest linked folder wins. A `.doorman` file containing a client name
 * (safe to commit; it holds no keys) also works.
 */
export function roomForFolder(dir) {
  if (!dir) return null;
  const meta = readMeta();
  const links = [];
  for (const r of Object.values(meta.rooms)) for (const f of r.folders || []) links.push([f, r]);
  let cur = canonical(dir);
  for (;;) {
    const hit = links.find(([f]) => f === cur);
    if (hit) return { room: hit[1].id, label: hit[1].label, folder: cur, via: 'link' };
    const marker = path.join(cur, '.doorman');
    try {
      const text = fs.readFileSync(marker, 'utf8');
      const m = text.match(/^\s*(?:room|client)\s*[:=]\s*(.+?)\s*$/im) || text.match(/^\s*([^#\n].*?)\s*$/m);
      const r = m && findRoom(m[1]);
      if (r) return { room: r.id, label: r.label, folder: cur, via: 'file' };
    } catch { /* no marker here */ }
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
}

// ---- Keys ----------------------------------------------------------------

export function listSecrets() {
  const meta = readMeta();
  return Object.values(meta.secrets).map((s) => ({ ...s, roomLabel: meta.rooms[s.room]?.label || s.room }))
    .sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name));
}

/** Look up a key by its full id ("stripe" or "acme/stripe"). */
export function getSecretMeta(id) {
  const s = readMeta().secrets[id];
  return s ? { ...s } : null;
}

export const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** The environment variable a secret is exposed as in `doorman run` (e.g. STRIPE_SECRET_KEY). */
export function envNameOf(meta) {
  return meta.envName || meta.name.toUpperCase().replace(/-/g, '_');
}

/** Environment for child processes: never leak Electron's run-as-node switch into them. */
export function childEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

export async function saveSecret({ name, room = OWN, value, description = '', allowedHosts = [], allowCommands = true, lockHosts = false, envName }) {
  validateName(name);
  if (envName && !ENV_RE.test(envName)) throw new Error('Environment variable names use letters, numbers and "_", and cannot start with a number.');
  const r = ensureRoom(room || OWN);
  const id = makeId(r.id, name);
  const meta = readMeta();
  const existing = meta.secrets[id];
  if (value) await keychainWrite(id, value);
  else if (!existing) throw new Error('A value is required for a new secret.');
  meta.secrets[id] = {
    id,
    name,
    room: r.id,
    description: String(description || '').slice(0, 500),
    allowedHosts: normalizeHosts(allowedHosts),
    allowCommands: allowCommands !== false,
    lockHosts: Boolean(lockHosts) && normalizeHosts(allowedHosts).length > 0,
    envName: envName || existing?.envName || undefined,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastUsedAt: existing?.lastUsedAt || null,
  };
  writeMeta(meta);
  return meta.secrets[id];
}

export async function deleteSecret(id) {
  validateId(id);
  const meta = readMeta();
  delete meta.secrets[id];
  writeMeta(meta);
  await keychainDelete(id);
}

export async function revealSecret(id) {
  validateId(id);
  if (!readMeta().secrets[id]) throw new Error(`No key "${id}".`);
  return keychainRead(id);
}

export function markUsed(ids) {
  const meta = readMeta();
  const now = new Date().toISOString();
  for (const n of ids) if (meta.secrets[n]) meta.secrets[n].lastUsedAt = now;
  writeMeta(meta);
}

// ---- Guest book ------------------------------------------------------------

// The audit log records WHICH secret was used, WHERE and WHEN. Never the value.
export function audit(entry) {
  ensureHome();
  fs.appendFileSync(AUDIT_FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 });
}

export function readAudit(limit = 50) {
  try {
    return fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').slice(-limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
