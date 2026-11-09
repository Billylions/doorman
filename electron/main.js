// Doorman.app: a native macOS shell around the local Doorman page,
// with a menu bar icon and a doorman:// link the AI uses to ask for keys.
import { app, BrowserWindow, Tray, Menu, nativeImage, nativeTheme, shell, clipboard, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startUi } from '../src/ui.js';
import { setupInfo } from '../src/setup.js';
import { installCli } from '../src/installcli.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const asset = (f) => path.join(here, '..', 'build', f);

let ui = null;
let win = null;
let tray = null;
let quitting = false;
let pendingAdd = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAsDefaultProtocolClient('doorman');
}

// doorman://add?name=stripe&desc=...&hosts=api.stripe.com&hint=https://...&room=Acme
// doorman://link?folder=/path/to/project&client=Acme
function parseDeepLink(link) {
  try {
    const u = new URL(link);
    if (u.protocol !== 'doorman:') return null;
    const action = u.hostname || u.pathname.replace(/^\/+/, '');
    const p = u.searchParams;
    if (action === 'add') {
      return { add: p.get('name') || '', desc: p.get('desc') || '', hosts: p.get('hosts') || '', hint: p.get('hint') || '', room: p.get('room') || '' };
    }
    if (action === 'link' && p.get('folder')) return { link: p.get('folder'), client: p.get('client') || '' };
    return null;
  } catch {
    return null;
  }
}

app.on('open-url', (event, link) => {
  event.preventDefault();
  const add = parseDeepLink(link);
  if (!add) return;
  if (app.isReady() && ui) showWindow(add);
  else pendingAdd = add;
});

function pageUrl(add) {
  const q = new URLSearchParams({ app: '1' });
  if (add) for (const [k, v] of Object.entries(add)) if (v) q.set(k, v);
  return `${ui.url}&${q}`;
}

function createWindow() {
  win = new BrowserWindow({
    width: 780,
    height: 860,
    minWidth: 420,
    minHeight: 500,
    show: false,
    title: 'Doorman',
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15141a' : '#f6f2e9',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  const origin = new URL(ui.url).origin;
  // Keep the window on Doorman; open real links (e.g. "where to get this key") in the browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== origin) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    app.dock?.hide(); // live quietly in the menu bar
  });
}

function showWindow(add = null) {
  const fresh = !win;
  if (fresh) {
    createWindow();
    win.once('ready-to-show', () => win.show());
  }
  // Reload only when there's something new to show, so open forms aren't wiped.
  if (fresh || add) win.loadURL(pageUrl(add));
  if (!fresh) win.show();
  app.dock?.show();
  win.focus();
  app.focus({ steal: Boolean(add) });
}

function buildTray() {
  const icon = nativeImage.createFromPath(asset('trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Doorman');
  const refresh = () => {
    const login = app.getLoginItemSettings().openAtLogin;
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open the front desk', click: () => showWindow() },
      { label: 'Check in a key…', click: () => showWindow({ new: '1' }) },
      { type: 'separator' },
      {
        label: 'Copy Claude Code setup command',
        click: () => clipboard.writeText(setupInfo().claudeCode),
      },
      {
        label: 'Install the doorman command…',
        click: () => {
          try {
            const r = installCli();
            dialog.showMessageBox({
              message: 'The doorman command is installed',
              detail: `Saved to ${r.target}.\n\nRun any app with your keys:\n  doorman run -- npm run dev\n\nCheck in a .env file:\n  doorman import .env` +
                (r.onPath ? '' : `\n\nAdd ${r.dir} to your PATH to use it from any terminal.`),
            });
          } catch (e) {
            dialog.showErrorBox('Could not install the doorman command', e.message);
          }
        },
      },
      {
        label: 'Open at login',
        type: 'checkbox',
        checked: login,
        click: () => { app.setLoginItemSettings({ openAtLogin: !login }); refresh(); },
      },
      { type: 'separator' },
      { label: 'Send Doorman home (Quit)', click: () => { quitting = true; app.quit(); } },
    ]));
  };
  refresh();
}

app.on('second-instance', () => showWindow());
app.on('activate', () => showWindow());
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(async () => {
  ui = await startUi({ port: 0 });
  buildTray();
  // Launched at login → stay in the menu bar. Otherwise open the window.
  const atLogin = app.getLoginItemSettings().wasOpenedAtLogin;
  if (pendingAdd) showWindow(pendingAdd);
  else if (!atLogin) showWindow();
  else app.dock?.hide();
  pendingAdd = null;
});
