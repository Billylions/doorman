// Local note-style UI. Binds to 127.0.0.1 only, requires a random
// per-launch token, and rejects foreign Host headers (DNS rebinding).
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import * as vault from './vault.js';
import { setupInfo } from './setup.js';
import { previewImport, importKeys } from './importer.js';
import { PAGE } from './page.js';

export function openBrowser(url) {
  execFile('open', [url], () => {});
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1_000_000) { reject(new Error('Too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}

export function startUi({ port = 0 } = {}) {
  const token = crypto.randomBytes(24).toString('base64url');

  const server = http.createServer(async (req, res) => {
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, {
        'content-type': type,
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:",
      });
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };

    const actualPort = server.address().port;
    const okHosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
    if (!okHosts.includes(req.headers.host)) return send(403, { error: 'Bad host' });

    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/' && req.method === 'GET') {
      if (url.searchParams.get('t') !== token) return send(403, 'Open Doorman from the link in your terminal.', 'text/plain');
      return send(200, PAGE, 'text/html; charset=utf-8');
    }

    if (!url.pathname.startsWith('/api/')) return send(404, { error: 'Not found' });
    const given = Buffer.from(String(req.headers['x-doorman-token'] || ''));
    const want = Buffer.from(token);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return send(403, { error: 'Bad token' });

    try {
      const m = url.pathname.match(/^\/api\/secrets(?:\/([^/]+))?(\/reveal)?$/);
      if (m && !m[1] && req.method === 'GET') return send(200, { secrets: vault.listSecrets(), rooms: vault.listRooms() });
      if (m && !m[1] && req.method === 'POST') {
        const body = await readJson(req);
        const saved = await vault.saveSecret({
          name: body.name, room: body.room || vault.OWN, value: body.value, description: body.description,
          allowedHosts: body.allowedHosts, allowCommands: body.allowCommands, lockHosts: body.lockHosts, envName: body.envName || undefined,
        });
        vault.audit({ tool: 'ui_checkin', secrets: [saved.id], room: saved.room });
        return send(200, { secret: saved });
      }
      if (m && m[1] && m[2] && req.method === 'POST') {
        const id = decodeURIComponent(m[1]);
        vault.audit({ tool: 'ui_copy', secrets: [id] });
        return send(200, { value: await vault.revealSecret(id) });
      }
      if (m && m[1] && !m[2] && req.method === 'DELETE') {
        const id = decodeURIComponent(m[1]);
        await vault.deleteSecret(id);
        vault.audit({ tool: 'ui_checkout', secrets: [id] });
        return send(200, { ok: true });
      }
      // Rooms (clients) and the project folders linked to them.
      if (url.pathname === '/api/rooms' && req.method === 'POST') {
        const body = await readJson(req);
        return send(200, { room: vault.ensureRoom(body.label) });
      }
      if (url.pathname === '/api/rooms/link' && req.method === 'POST') {
        const body = await readJson(req);
        const room = vault.ensureRoom(body.room || vault.OWN);
        const r = vault.linkFolder(room.id, body.folder);
        vault.audit({ tool: 'link_project', room: r.room, folder: r.folder });
        return send(200, r);
      }
      if (url.pathname === '/api/rooms/unlink' && req.method === 'POST') {
        const body = await readJson(req);
        vault.unlinkFolder(body.folder);
        vault.audit({ tool: 'unlink_project', folder: body.folder });
        return send(200, { ok: true });
      }
      if (url.pathname === '/api/rooms/rename' && req.method === 'POST') {
        const body = await readJson(req);
        return send(200, { room: vault.renameRoom(body.id, body.label) });
      }
      if (url.pathname === '/api/import/preview' && req.method === 'POST') {
        const body = await readJson(req);
        return send(200, previewImport(body.text, body.room));
      }
      if (url.pathname === '/api/import' && req.method === 'POST') {
        const body = await readJson(req);
        return send(200, { saved: await importKeys(body.text, body.picks || [], body.room) });
      }
      if (url.pathname === '/api/audit' && req.method === 'GET') return send(200, { entries: vault.readAudit(30).reverse() });
      if (url.pathname === '/api/setup' && req.method === 'GET') return send(200, setupInfo());
      return send(404, { error: 'Not found' });
    } catch (e) {
      return send(400, { error: e.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address();
      resolve({ url: `http://127.0.0.1:${p}/?t=${token}`, close: () => server.close() });
    });
  });
}
