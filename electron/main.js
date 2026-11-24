// Relay Electron shell — janela, tray, sidecar Python e hotkey global.
//
// A UI é a webui React servida pelo FastAPI; este processo só orquestra.
// Gravação/transcrição/banco continuam 100% no sidecar Python.
const { app, BrowserWindow, Tray, Menu, Notification, globalShortcut, shell, dialog } = require('electron');
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const PORT = Number(process.env.RELAY_PORT || 9777);
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Em dev: ELECTRON_URL=http://localhost:3000 (vite) — senão o FastAPI serve o build.
const RENDER_URL = process.env.ELECTRON_URL || BASE_URL;
const HOTKEY = 'CommandOrControl+Shift+R';

let win = null;
let tray = null;
let sidecar = null;
let quitting = false;
const logFile = path.join(app.getPath('userData'), 'sidecar.log');

function log(...args) {
  const line = `[main] ${args.join(' ')}`;
  // eslint-disable-next-line no-console
  console.log(line);
  try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`); } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Sidecar Python
// ---------------------------------------------------------------------------
function resolvePython() {
  if (process.env.RELAY_PYTHON) return process.env.RELAY_PYTHON;
  const bundled = process.platform === 'win32'
    ? path.join(process.resourcesPath, 'sidecar', 'relay-server.exe')
    : path.join(process.resourcesPath, 'sidecar', 'relay-server');
  if (fs.existsSync(bundled)) return bundled;
  const venv = path.join(__dirname, '..', 'local-client', '.venv', 'bin', 'python');
  if (fs.existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function api(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      `${BASE_URL}${apiPath}`,
      { method, headers: data ? { 'Content-Type': 'application/json' } : {} },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {} }); }
          catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

function waitHealthy(timeoutMs = 30000) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      api('GET', '/api/health').then(
        ({ status, body }) => {
          if (status === 200 && body && body.status === 'ok') return resolve(true);
          if (Date.now() - t0 > timeoutMs) return resolve(false);
          setTimeout(tick, 500);
        },
        () => (Date.now() - t0 > timeoutMs ? resolve(false) : setTimeout(tick, 500)),
      );
    };
    tick();
  });
}

async function startSidecar() {
  const python = resolvePython();
  const cwd = path.join(__dirname, '..', 'local-client');
  log('subindo sidecar:', python, '(cwd=local-client)');
  sidecar = spawn(python, ['-m', 'relay.webmain', '--port', String(PORT)], {
    cwd,
    env: { ...process.env, PYTHONPATH: cwd, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = fs.createWriteStream(logFile, { flags: 'a' });
  sidecar.stdout.on('data', (d) => out.write(`[sidecar] ${d}`));
  sidecar.stderr.on('data', (d) => out.write(`[sidecar:err] ${d}`));
  sidecar.on('exit', (code) => {
    log(`sidecar saiu (code=${code})`);
    if (!quitting) {
      dialog.showErrorBox('Relay', `O motor local encerrou (code ${code}). Veja o log em:\n${logFile}`);
      app.quit();
    }
  });
  const ok = await waitHealthy();
  if (!ok) {
    stopSidecar();
    throw new Error(`sidecar não respondeu em ${BASE_URL}/api/health`);
  }
  log('sidecar saudável em', BASE_URL);
}

function stopSidecar() {
  if (!sidecar || sidecar.exitCode !== null) return;
  try {
    // mata a árvore inteira (o servidor pode ter filhos)
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${sidecar.pid} /T /F`);
    } else {
      try { process.kill(-sidecar.pid, 'SIGTERM'); } catch { sidecar.kill('SIGTERM'); }
    }
  } catch { /* já morreu */ }
  sidecar = null;
}

// ---------------------------------------------------------------------------
// Gravação (o que o Ctrl+Shift+R aciona)
// ---------------------------------------------------------------------------
async function toggleRecording() {
  try {
    const { status, body } = await api('GET', '/api/recordings/live/status');
    if (status !== 200) throw new Error(`status ${status}`);
    let msg;
    if (body.recording) {
      const done = await api('POST', '/api/recordings/live/stop', {});
      msg = done.status === 200
        ? `Gravação salva (${done.body.durationSec ?? '?'}s)`
        : `Falha ao parar (${done.status})`;
    } else {
      const started = await api('POST', '/api/recordings/live/start', {});
      msg = started.status === 201
        ? `Gravando… (${started.body.mic || '?'} + ${started.body.monitor || '?'})`
        : `Falha ao gravar (${started.status})`;
    }
    new Notification({ title: 'Relay', body: msg }).show();
    updateTray(body.recording ? false : true);
  } catch (e) {
    new Notification({ title: 'Relay', body: `Relay fora do ar: ${e.message}` }).show();
  }
}

// ---------------------------------------------------------------------------
// Janela + tray
// ---------------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  win.loadURL(RENDER_URL);
  if (process.env.ELECTRON_DEV) win.webContents.openDevTools({ mode: 'detach' });
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide(); // fechar minimiza para o tray (comportamento de app residente)
    }
  });
  // links externos abrem no navegador
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(BASE_URL) && !url.startsWith('http://localhost:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

function updateTray(recording) {
  if (!tray) return;
  tray.setToolTip(recording ? 'Relay — ● gravando' : 'Relay');
  buildTrayMenu(recording);
}

function buildTrayMenu(recording = false) {
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Relay', click: () => { win.show(); win.focus(); } },
    { label: recording ? '■ Parar gravação' : '● Iniciar gravação', click: toggleRecording },
    {
      label: 'Reiniciar motor local',
      click: async () => { stopSidecar(); await startSidecar(); },
    },
    { type: 'separator' },
    {
      label: 'Abrir log',
      click: () => shell.openPath(logFile).catch(() => shell.showItemInFolder(logFile)),
    },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  // TODO(E3): ícone próprio; usa o do Electron no spike.
  tray = new Tray(path.join(__dirname, '..', '..', 'build', 'icon.png'));
  buildTrayMenu(false);
  tray.on('click', () => { win.isVisible() ? win.hide() : win.show(); });
}

// ---------------------------------------------------------------------------
// Auto-update (E3) — só ativa com ELECTRON_UPDATE_FEED setado (URL do feed ou
// "github"; sem feed, loga e segue sem electron-updater).
// ---------------------------------------------------------------------------
function setupAutoUpdate() {
  const feed = process.env.ELECTRON_UPDATE_FEED;
  if (!feed) {
    log('auto-update desativado (sem ELECTRON_UPDATE_FEED)');
    return;
  }
  if (!app.isPackaged) {
    log('auto-update ignorado em dev (app não empacotado)');
    return;
  }
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    log('auto-update indisponível (electron-updater não instalado):', e.message);
    return;
  }
  autoUpdater.on('checking-for-update', () => log('auto-update: verificando…'));
  autoUpdater.on('update-available', (info) => log('auto-update disponível:', info.version));
  autoUpdater.on('update-not-available', () => log('auto-update: já na última versão'));
  autoUpdater.on('error', (e) => log('auto-update erro:', e.message));
  autoUpdater.on('update-downloaded', (info) => {
    log('auto-update baixado:', info.version, '— instala ao sair');
    autoUpdater.quitAndInstall(false, true);
  });
  autoUpdater.checkForUpdatesAndNotify().catch((e) => log('auto-update falhou:', e.message));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

  app.whenReady().then(async () => {
    if (process.env.RELAY_AUTOSTART === '1') {
      app.setLoginItemSettings({ openAtLogin: true });
    }
    try {
      await startSidecar();
    } catch (e) {
      dialog.showErrorBox('Relay', `Não subi o motor local:\n${e.message}`);
      app.quit();
      return;
    }
    createWindow();
    try {
      createTray();
    } catch (e) {
      log('tray indisponível:', e.message);
    }
    const ok = globalShortcut.register(HOTKEY, toggleRecording);
    log(`hotkey ${HOTKEY}:`, ok ? 'registrada' : 'FALHOU (Wayland pode exigir permissão)');
    setupAutoUpdate();
    if (process.platform === 'darwin') {
      // macOS exige consentimento de microfone/câmera; o Electron pede sozinho no getUserMedia.
    }
  });

  app.on('window-all-closed', () => {
    // residente: só sai pelo tray/Sair (no macOS, comportamento padrão já é esse)
    if (process.platform === 'darwin' && !quitting) return;
    if (!quitting) return; // Linux/Windows: janela fechada = minimizado no tray
    app.quit();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopSidecar();
  });
}
