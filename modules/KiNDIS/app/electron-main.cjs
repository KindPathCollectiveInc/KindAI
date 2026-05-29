/**
 * KiNDIS Electron entry point (CommonJS)
 *
 * Thin wrapper — loads the KiNDIS FastAPI server UI at http://localhost:7864/app.
 * The Python server must be running (via run.sh or launchd) before opening.
 */

'use strict'

const { app, BrowserWindow, shell } = require('electron')
const http = require('http')

app.setName('KiNDIS')
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')

const SERVER_PORT = 7864
const APP_URL = `http://localhost:${SERVER_PORT}/app`

let win = null

function waitForServer(url, retries, delay, cb) {
  http.get(url.replace('/app', '/api/health'), (res) => {
    if (res.statusCode < 500) cb(null)
    else retry()
  }).on('error', retry)

  function retry() {
    if (retries <= 0) { cb(new Error('Server did not start')) ; return }
    setTimeout(() => waitForServer(url, retries - 1, delay, cb), delay)
  }
}

function createWindow() {
  if (win) { win.show(); win.focus(); return }

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    title: 'KiNDIS',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  waitForServer(APP_URL, 20, 500, (err) => {
    if (err) {
      win.loadURL('data:text/html,<h2 style="font-family:system-ui;padding:40px;color:#38bdf8">KiNDIS server not running.<br><small>Run: cd /Users/sam/dev/KindPath-Collective/KiNDIS && ./run.sh</small></h2>')
    } else {
      win.loadURL(APP_URL)
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  win.on('closed', () => { win = null })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (!win) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
