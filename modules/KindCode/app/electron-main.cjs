// KindCode Electron main process.
// Loads the FastAPI backend server and opens a window pointing at it.
// Port 7876.

const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

const PORT = 7876
let mainWindow = null
let serverProcess = null

function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) resolve()
        else retry(n)
      }).on('error', () => retry(n))
    }
    function retry(n) {
      if (n <= 0) return reject(new Error('Server did not start'))
      setTimeout(() => attempt(n - 1), 500)
    }
    attempt(retries)
  })
}

function startServer() {
  const serverDir = path.join(__dirname, '..')
  // Try venv python first, then system python3
  const pythonCandidates = [
    path.join(serverDir, 'venv', 'bin', 'python'),
    'python3',
  ]
  const python = pythonCandidates[0]

  serverProcess = spawn(python, ['server.py'], {
    cwd: serverDir,
    stdio: 'ignore',
    detached: false,
  })

  serverProcess.on('error', () => {
    // Fallback to system python3
    serverProcess = spawn('python3', ['server.py'], {
      cwd: serverDir,
      stdio: 'ignore',
      detached: false,
    })
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0D0D0D',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(`http://localhost:${PORT}/app`)

  // Open external links in browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  startServer()
  try {
    await waitForServer()
  } catch {
    console.error('KindCode server failed to start')
  }
  createWindow()
})

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
