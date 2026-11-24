# E3 — Empacotamento e release do Relay Desktop

Runbook de release: web UI → sidecar Python → Electron → publicar → auto-update.
Alvo suportado nesta etapa: **Linux (AppImage + deb)**. Windows/macOS ficam para depois.

## Pipeline de release (ordem)

### 1. Build da web UI

```bash
cd local-client/webui   # (ou o diretório do frontend React, quando existir)
npm install
npm run build            # gera local-client/webui/dist
```

Sem `webui/dist`, o sidecar serve só a API (`_mount_webui` faz fallback silencioso).
Confira que `dist/index.html` existe antes de seguir.

### 2. Build do sidecar

```bash
cd local-client
pip install pyinstaller   # só na 1ª vez; valide com: pyinstaller --version
./build-sidecar.sh
```

Saída: `local-client/dist-sidecar/relay-server` (one-file) + `webui-dist/` ao lado.
Detalhes do que entra/sai do binário: ver comentários no próprio `build-sidecar.sh`
(Qt excluído — headless; CUDA/torch-GPU excluídos — CPU-only; modelos Whisper
baixados em runtime, fora do binário).

Teste manual do binário (porta livre, sem Electron):

```bash
./dist-sidecar/relay-server --port 9777
curl -s http://127.0.0.1:9777/api/health
```

### 3. Electron: pack + dist

```bash
cd electron
npm install                 # só na 1ª vez (traz electron-updater)
npm run pack                # pasta dist/ sem instalador (fumaça rápida)
npm run dist                # AppImage + .deb (Linux)
```

O `extraResources.sidecar/` do `electron-builder` espera o binário do passo 2
em `local-client/dist-sidecar/`. Sem ele, o shell cai para o `.venv` de dev
(ver `resolvePython()` em `main.js`) — ok para dev, **não** para release.

Publicação no GitHub Releases (placeholder atual em `electron/package.json`):

```json
"publish": [{ "provider": "github", "owner": "CHANGEME", "repo": "relay" }]
```

Trocar `CHANGEME` pelo owner real antes do primeiro release. Com `GH_TOKEN`
exportado, `npm run dist` já publica o draft + `latest-linux.yml` (feed do update).

### 4. Publicar

1. Tag `vX.Y.Z` = `version` de `electron/package.json` (manter sincronizados).
2. `GH_TOKEN=... npm run dist` (sobe AppImage, deb e o `.yml` do feed).
3. Anexar ao release: checksum/sha256 dos artefatos.
4. Smoke test do instalador em máquina limpa (checklist abaixo).

### 5. Auto-update

`main.js` só ativa o `electron-updater` com `ELECTRON_UPDATE_FEED` setado;
sem feed, loga `auto-update desativado` e segue (dev e CI não quebram).
Em produção empacotada, o feed padrão é o `latest-linux.yml` do GitHub Releases
(resolvido pelo `publish` do package.json) — `ELECTRON_UPDATE_FEED` serve para
apontar staging/espelho. Fluxo: `checkForUpdatesAndNotify` no boot →
baixa em background → `quitAndInstall` na saída.

## Headless (sem display)

- Sidecar/Electron: `python -m relay.webmain --port 9777` (só API+web).
- Entry point clássico também aceita: `python -m relay --headless` (ou `--no-gui`):
  sobe `init_db` + `start_api` e dorme — sem `QApplication`.
- O Electron **não** precisa de display para subir o sidecar; só a `BrowserWindow`
  exige servidor gráfico.

## Checklist de máquina limpa (pós-instalação)

- [ ] Instala via AppImage e via .deb em VM/container limpo (sem `.venv`, sem node).
- [ ] Abre a janela na web UI buildada (não no vite de dev).
- [ ] `curl http://127.0.0.1:9777/api/health` → `{"status":"ok"}` (sidecar empacotado).
- [ ] Tray aparece com menu; fechar minimiza; Sair mata o sidecar
      (sem zumbi: `ps aux | grep relay-server` vazio).
- [ ] `Ctrl+Shift+R` grava/para com o app em background (notificação confirma).
- [ ] Sem mic/PipeWire: erro 400 amigável, sem crash.
- [ ] Segunda instância foca a primeira.
- [ ] `~/.config/Relay/sidecar.log` (ou `userData/sidecar.log`) contém
      `auto-update desativado` (sem feed) ou o ciclo de update (com feed).
- [ ] Com feed: publica versão N+1 e confirma download + instalação ao sair.

## Wayland / X11

| Ambiente | O que funciona | Atenção |
|---|---|---|
| X11 | Tudo (tray, hotkey global, `desktopCapturer`). | — |
| Wayland (GNOME/KDE) | Janela, sidecar, update. | **Hotkey global `Ctrl+Shift+R` pode falhar**: o Wayland não permite grab global de teclado para apps comuns — o Electron loga `FALHOU`. Alternativa: registrar o atalho nas Configurações do GNOME (atalho personalizado → `relay-desktop --toggle-record`, quando o CLI existir) ou usar o botão do tray. |
| Wayland | Tray | Alguns compositores (GNOME puro) escondem tray icons — use a extensão AppIndicator. O app segue funcional sem tray (janela + Sair pelo menu). |
| Ambos | `desktopCapturer` | No Wayland, captura de tela exige portal xdg + consentimento por sessão. |

Dica CI/headless: `QT_QPA_PLATFORM=offscreen` para os testes Qt; o Electron
**não** roda sem display nesta etapa (sem `--no-sandbox`/Xvfb no runbook —
validar instalador sempre em máquina com display real ou VM com video).
