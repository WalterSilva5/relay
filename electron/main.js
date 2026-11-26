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
const ROUTE_RE = /^\/[a-z0-9/-]*$/;

let win = null;
let tray = null;
let sidecar = null;
let quitting = false;
let rendererReloads = [];
const logFile = path.join(app.getPath('userData'), 'sidecar.log');

function log(...args) {
  const line = `[main] ${args.join(' ')}`;
  // eslint-disable-next-line no-console
  console.log(line);
  try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`); } catch { /* noop */ }
}

// Rota inicial opcional: o launcher (electron/relay-electron.sh) e os links
// relay:// passam `--route=/reviews`. Fora do padrão, a rota é ignorada.
function parseRoute(argv = process.argv) {
  const arg = argv.find((a) => typeof a === 'string' && a.startsWith('--route='));
  if (!arg) return '';
  let route = arg.slice('--route='.length).trim().toLowerCase();
  if (!route) return '';
  if (!route.startsWith('/')) route = `/${route}`;
  route = route.replace(/\/{2,}/g, '/');
  if (route.length > 1) route = route.replace(/\/+$/, '');
  if (route === '/' || !ROUTE_RE.test(route)) return '';
  return route;
}

function urlFor(route) {
  if (!route) return RENDER_URL;
  return `${RENDER_URL.replace(/\/+$/, '')}${route}`;
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

let sidecarOwned = false;

async function startSidecar() {
  // Se já existe um sidecar saudável (ex.: órfão de um crash anterior),
  // reaproveita em vez de subir outro e brigar pela porta.
  try {
    if (await waitHealthy(2000)) {
      log('sidecar já rodando — reaproveitando (não será encerrado no quit)');
      return BASE_URL;
    }
  } catch { /* segue para o spawn normal */ }
  const runtime = resolvePython();
  const isBundle = path.basename(runtime) === 'relay-server' || path.basename(runtime) === 'relay-server.exe';
  // No pacote, o sidecar é o binário (já recebe --port); em dev, é o Python
  // rodando o módulo (-m relay.webmain) com cwd=local-client.
  const args = isBundle ? ['--port', String(PORT)] : ['-m', 'relay.webmain', '--port', String(PORT)];
  const cwd = isBundle ? undefined : path.join(__dirname, '..', 'local-client');
  const env = { ...process.env, PYTHONUNBUFFERED: '1' };
  if (!isBundle && cwd) env.PYTHONPATH = cwd;
  log('subindo sidecar:', runtime, args.join(' '), cwd ? `(cwd=${cwd})` : '(sem cwd)');
  sidecar = spawn(runtime, args, {
    ...(cwd ? { cwd } : {}),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32', // grupo próprio: kill(-pid) mata a árvore
  });
  sidecar.on('error', (err) => {
    log(`falha ao iniciar o sidecar: ${err.message}`);
    if (!quitting) {
      try { dialog.showErrorBox('Relay', `Não consegui iniciar o motor local:\n${err.message}`); } catch {}
      app.quit();
    }
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
  sidecarOwned = true;
  log('sidecar saudável em', BASE_URL);
}

function stopSidecar() {
  // Só encerra o que este processo subiu; sidecar reaproveitado é alheio.
  if (!sidecarOwned) { log('stopSidecar: não é meu, mantendo'); sidecar = null; return; }
  if (!sidecar || sidecar.exitCode !== null) { log('stopSidecar: já encerrado'); return; }
  const proc = sidecar;
  const pid = proc.pid;
  if (process.platform === 'win32') {
    log(`stopSidecar: taskkill na árvore ${pid}`);
    try { execSync(`taskkill /pid ${pid} /T /F`); } catch (e) { log(`stopSidecar taskkill: ${e.message}`); }
    sidecar = null;
    return;
  }
  log(`stopSidecar: SIGTERM no grupo ${pid}`);
  try { process.kill(-pid, 'SIGTERM'); } catch (e) { log(`stopSidecar kill falhou: ${e.message}`); }
  setTimeout(() => {
    if (proc.exitCode === null) {
      log(`stopSidecar: ainda vivo após 3s, SIGKILL no grupo ${pid}`);
      try { process.kill(-pid, 'SIGKILL'); } catch { /* já morreu */ }
    }
  }, 3000).unref();
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
// Recupera a janela de um renderer morto sem entrar em loop: no máximo dois
// reloads por minuto. Board muito grande/GC/GPU podem derrubar o renderer e
// deixar a janela "congelada" (o processo principal continua vivo).
function recoverRenderer(reason) {
  if (quitting || !win) return;
  const now = Date.now();
  rendererReloads = rendererReloads.filter((t) => now - t < 60000);
  if (rendererReloads.length >= 2) {
    log('renderer caiu de novo; reload automático suspenso:', reason);
    return;
  }
  rendererReloads.push(now);
  log('recarregando janela após queda do renderer:', reason);
  try { win.reload(); } catch (e) { log('falha ao recarregar:', e.message); }
}

async function createWindow() {
  const route = parseRoute();
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  if (route) log('rota inicial:', route);
  // O bundle é servido localmente; limpar o cache evita abrir uma UI antiga
  // depois de atualizar o webui-dist (o service worker do PWA é removido junto).
  try {
    await win.webContents.session.clearCache();
    await win.webContents.session.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
    log('cache da UI limpo na inicialização');
  } catch (e) {
    log('falha ao limpar cache da UI:', e.message);
  }
  win.loadURL(urlFor(route));
  win.webContents.on('render-process-gone', (_event, details) => {
    log('renderer encerrado:', details.reason, details.exitCode);
    recoverRenderer(details.reason);
  });
  win.webContents.on('unresponsive', () => {
    log('renderer não respondeu (janela ocupada); use Bandeja > Recarregar janela');
    new Notification({
      title: 'Relay',
      body: 'A interface está ocupada. Se demorar, use Bandeja > Recarregar janela.',
    }).show();
  });
  win.webContents.on('responsive', () => log('renderer voltou a responder'));
  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    log('falha ao carregar:', code, desc, url);
  });
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
    { label: 'Recarregar janela', click: () => { if (win) win.reload(); } },
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

function trayIcon() {
  // Embarcado via `files` do electron-builder (dev: electron/assets, pacote: app.asar/assets).
  const bundled = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(bundled)) return bundled;
  return null;
}

function createTray() {
  const icon = trayIcon();
  if (!icon) {
    log('sem ícone de tray — seguindo sem tray (menu indisponível)');
    return;
  }
  tray = new Tray(icon);
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
  app.on('second-instance', (_event, argv) => {
    if (!win) return;
    // Um relay:// com o app já aberto vira navegação na janela existente.
    const route = parseRoute(argv);
    if (route) {
      log('rota via 2ª instância:', route);
      win.loadURL(urlFor(route));
    }
    win.show();
    win.focus();
  });

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
    createWindow().catch((e) => log('falha ao criar janela:', e?.message || e));
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

  // Residente: só sai pelo tray/Sair (no macOS, comportamento padrão já é esse).
  app.on('window-all-closed', () => {
    if (process.platform === 'darwin' && !quitting) return;
    if (!quitting) return; // Linux/Windows: janela fechada = minimizado no tray
    app.quit();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopSidecar();
  });

  // Desligamento do SO / kill: garante quit gracioso (fecha sidecar próprio).
  // O handler roda antes do default do Chromium; sem ele o app morre sem will-quit.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      log(`sinal ${sig} recebido — encerrando`);
      quitting = true;
      try { stopSidecar(); } catch (e) { log(`stop no sinal falhou: ${e.message}`); }
      app.quit();
    });
  }
}
