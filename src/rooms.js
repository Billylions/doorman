// Picking the right client's key for the project the AI is working in.
//
// Rules (designed so a key never ends up in the wrong client's project):
//  - In a folder linked to a client's room, {{doorman:stripe}} is that
//    client's stripe key. If the client has none, your own key is used.
//    Other clients' keys are off limits there.
//  - In a folder that isn't linked to a client, only your own keys work.
//    If the key only exists for clients, Doorman asks the AI to find out
//    which client the project is for (link_project), instead of guessing.
import * as vault from './vault.js';

export function projectRoom(projectDir) {
  return vault.roomForFolder(projectDir || process.cwd());
}

function where(names) {
  return names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
}

/** Resolve one placeholder ref ("stripe" or "acme/stripe") for a project. */
export function resolveRef(ref, projectDir) {
  const here = projectRoom(projectDir);
  const all = vault.listSecrets();

  if (ref.includes('/')) {
    const meta = vault.getSecretMeta(ref);
    if (!meta) return { ok: false, reason: `No key "${ref}".` };
    if (!here) {
      return { ok: false, reason: `"${ref}" belongs to ${meta.roomLabel || meta.room}, but this folder isn't linked to a client. ` +
        `If this project is for ${meta.roomLabel || meta.room}, call link_project so the user can confirm, then use {{doorman:${meta.name}}}.` };
    }
    if (here.room !== meta.room) {
      return { ok: false, reason: `This project belongs to ${here.label}; "${ref}" is another client's key and can't be used here.` };
    }
    return { ok: true, meta, room: here };
  }

  const name = ref;
  const own = all.find((s) => s.room === vault.OWN && s.name === name);
  const clients = all.filter((s) => s.room !== vault.OWN && s.name === name);

  if (here && here.room !== vault.OWN) {
    const mine = clients.find((s) => s.room === here.room);
    if (mine) return { ok: true, meta: mine, room: here };
    if (own) {
      // Don't fall back to your own key if this client has its own key for the
      // same service under another name (same env var or same API host).
      const sameService = all.find((s) => s.room === here.room && (
        vault.envNameOf(s) === vault.envNameOf(own) || s.allowedHosts.some((h) => own.allowedHosts.includes(h))));
      if (sameService) {
        return { ok: false, reason: `${here.label} has its own key for this service: use {{doorman:${sameService.name}}} instead of {{doorman:${name}}}.` };
      }
      return { ok: true, meta: own, room: here, fallback: true };
    }
    const others = clients.map((s) => s.roomLabel);
    return {
      ok: false,
      reason: others.length
        ? `${here.label} has no "${name}" key (only ${where(others)} ${others.length === 1 ? 'has' : 'have'} one, and those can't be used in ${here.label}'s project). ` +
          `Call request_secret to ask the user for ${here.label}'s ${name} key.`
        : `No "${name}" key for ${here.label}. Call list_secrets, or request_secret to ask the user for it.`,
    };
  }

  if (own) return { ok: true, meta: own, room: here };
  if (clients.length) {
    return {
      ok: false,
      needsLink: true,
      reason: `"${name}" belongs to ${where(clients.map((s) => s.roomLabel))}, and this folder isn't linked to a client yet. ` +
        'Ask the user which client this project is for, then call link_project (the user confirms it in Doorman). Do not guess.',
    };
  }
  return { ok: false, reason: `No "${name}" key. Call list_secrets to see what exists, or request_secret to ask the user for it.` };
}

/** Resolve several refs at once. Returns { metas: {ref: meta}, error } . */
export function resolveRefs(refs, projectDir) {
  const metas = {};
  for (const ref of refs) {
    const r = resolveRef(ref, projectDir);
    if (!r.ok) return { metas, error: r.reason, needsLink: r.needsLink };
    metas[ref] = r.meta;
  }
  return { metas };
}

/** What an AI working in this folder may use, plus a summary of the rest. */
export function keysForProject(projectDir) {
  const here = projectRoom(projectDir);
  const all = vault.listSecrets();
  const clientRoom = here && here.room !== vault.OWN ? here.room : null;
  const usable = [];
  // The client's keys come first. Your own keys fill the gaps, but never one
  // that shares a name or an environment variable with a client key.
  const seenNames = new Set();
  const seenEnv = new Set();
  if (clientRoom) {
    for (const s of all.filter((x) => x.room === clientRoom)) {
      usable.push({ ...s, ref: s.name, owner: here.label });
      seenNames.add(s.name);
      seenEnv.add(vault.envNameOf(s));
    }
  }
  for (const s of all.filter((x) => x.room === vault.OWN && !seenNames.has(x.name) && !seenEnv.has(vault.envNameOf(x)))) {
    usable.push({ ...s, ref: s.name, owner: 'you' });
  }
  const others = vault.listRooms().filter((r) => r.id !== vault.OWN && r.id !== clientRoom && r.keys > 0);
  return { here, usable, others };
}
