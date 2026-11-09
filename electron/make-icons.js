// Renders Doorman's app icon and menu bar icon with Electron itself.
// Run: npm run icons   (then build/icon.icns is made with sips + iconutil, see README)
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appIconSvg, trayHatSvg } from '../src/icon.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');
fs.mkdirSync(out, { recursive: true });

async function render(svg, size, file) {
  const win = new BrowserWindow({ width: size, height: size, show: false, transparent: true, frame: false,
    webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  fs.writeFileSync(path.join(out, file), img.resize({ width: size, height: size }).toPNG());
  win.destroy();
}

app.on('window-all-closed', () => {}); // keep running between renders
app.whenReady().then(async () => {
  await render(appIconSvg(1024), 1024, 'icon.png');
  // Small windows render unreliably, so draw big and let sips downscale.
  await render(trayHatSvg(440), 440, 'tray-big.png');
  console.log('icons written to', out);
  app.quit();
});
