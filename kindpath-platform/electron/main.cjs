/**
 * KindPath Operations Platform — Electron entry point (CommonJS)
 *
 * Unlike the KiNDIS/KindCode Electron wrappers elsewhere in this repo,
 * this app has no local backend to wait for — it's a static build that
 * talks directly to Supabase over the network. So this main process just
 * serves its own built files (dist/) from a tiny local HTTP server and
 * opens a window pointed at it. A plain http server rather than file://
 * loading, so fetch()/localStorage behave exactly as they do in a real
 * browser origin — Electron's file:// handling has enough edge cases
 * around those to not be worth the risk.
 *
 * Routing is HashRouter (see src/App.tsx), so no server-side rewrite
 * rule is needed for deep links — every path resolves to the same
 * index.html and the hash fragment is handled entirely client-side.
 */

'use strict';

const { app, BrowserWindow, shell } = require('electron');
const http = require('http');
const path = require('node:path');
const fs = require('node:fs');

app.setName('KindPath Operations');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const DIST_DIR = path.join(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestedPath = decodeURIComponent((req.url || '/').split('?')[0]);
      // Strip any leading ".." segments left after normalization so the
      // joined path can never climb out of DIST_DIR (e.g. "/../../etc/passwd").
      const safePath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
      let filePath = requestedPath === '/' ? path.join(DIST_DIR, 'index.html') : path.join(DIST_DIR, safePath);

      // Any path without a real file on disk (shouldn't normally happen
      // with HashRouter, since only "/" is ever requested server-side)
      // falls back to index.html rather than 404ing.
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }

      const ext = path.extname(filePath);
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(port);
    });
    server.on('error', reject);
  });
}

let win = null;

async function createWindow() {
  if (win) {
    win.show();
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    title: 'KindPath Operations',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const port = await startStaticServer();
  win.loadURL(`http://127.0.0.1:${port}/`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (!win) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
