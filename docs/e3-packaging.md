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

## Build real executado em 2026-11-24 (Manjaro x64, sem display, sem Xvfb)

Tudo abaixo foi executado de verdade neste repo (branch com mudanças não
commitadas). Resultado: **sidecar + `electron-builder --linux dir` funcionam**;
AppImage/deb e smoke test com janela ficam para máquina com display.

### 0. Ambiente e pré-requisitos confirmados

```bash
cd electron && npm ls electron electron-builder
# relay-desktop@0.1.0
# ├── electron-builder@26.18.0
# └── electron@38.8.6            (tudo já instalado; nada para instalar aqui)
```

- Electron dist em cache: `~/.cache/electron/<hash>/electron-v38.8.6-linux-x64.zip`
  (114 MB) — o builder **não** precisou baixar nada.
- `.venv` em `local-client/.venv` já tinha faster-whisper + soundfile.
- Runtime do Electron presente no sistema (Manjaro): `libnss3`, `libgtk-3`,
  `libxkbcommon` (via `ldconfig -p`). Distro Arch-based: sem `dpkg`/`apt`.

### 1. PyInstaller + sidecar — OK (167 MB, testado)

```bash
local-client/.venv/bin/pip install pyinstaller   # instalou 6.22.3 + hooks-contrib
cd local-client && ./build-sidecar.sh            # ~4 min nesta máquina (46 GB RAM)
```

Saída: `local-client/dist-sidecar/relay-server` (**167 MB**, one-file) +
`dist-sidecar/webui-dist/` (copiada de `webui/dist`, que já existia buildada).

Teste real do binário (porta alternativa porque a 9777 já estava em uso pelo dev):

```bash
./dist-sidecar/relay-server --port 19777 &
curl -s http://127.0.0.1:19777/api/health   # {"status":"ok"}
kill <pid>  # sem zumbi: `ps` zerado e porta fechada (curl exit 7) após o kill
```

Peculiaridades registradas:
- `relay-server --help` **não imprime ajuda**: o `webmain` ignora o flag e dá
  boot no servidor (tenta bindar a 9777). Comportamento a corrigir se `--help`
  virar contrato.
- Correção aplicada no `build-sidecar.sh`: o script agora prefixa
  `$HERE/.venv/bin` no `PATH`. Sem isso, `command -v pyinstaller` e
  `python3 -c "import relay.webmain"` usam o Python do sistema e o build
  aborta com "PyInstaller não instalado" mesmo com tudo instalado.
- Warnings inofensivos no log: `ldd: permissão para execução` em
  `libgcc_s.so.1` e `av.libs/libhogweed/libnettle` (PyInstaller 6.22.3,
  análise estática — não afetam o binário).

### 2. Electron `--linux dir` — OK após 2 correções (454 MB desempacotado)

```bash
cd electron
npm install --no-audit --no-fund   # SÓ porque electron-updater (dependencies)
                                   # não estava instalado; sem -U de versões
npx electron-builder --linux dir --publish never   # exit 0
```

Saída: `electron/dist/linux-unpacked/` (**454 MB**), binário `relay-desktop`,
`resources/app.asar` (2,1 MB) e `resources/sidecar/relay-server` (167 MB,
**md5 idêntico** ao binário testado no passo 1: `7210d782c575f79f0b9fcd4a279b691c`).

Erros encontrados e corrigidos (documentados para não repetir):
1. `configuration.linux.desktop should be one of these: null` — o schema do
   electron-builder 26 **não aceita** `"desktop": { "StartupWMClass": ... }`
   direto. Correção aplicada em `electron/package.json` (única mudança no
   arquivo):
   `"desktop": { "entry": { "StartupWMClass": "Relay" } }`.
2. `Production dependency electron-updater not found` — faltava instalar
   (`npm install` resolveu; rede liberada, sem bump de versão).
3. Warning não-bloqueante: `author is missed in the package.json`.

Pendente de verificação (não quebra `--linux dir`, pode quebrar AppImage/deb):
- `build.icon` aponta para `../../build/icon.png`, que **não existe** no repo.
  O `dir` buildou com ícone default sem reclamar. Candidato a ícone real:
  `local-client/webui/dist/icon-512.png` (PNG 512×512 válido). Antes do
  `npm run dist`, ou criar `build/icon.png` ou trocar o `icon` no package.json
  e refazer o teste.

### 3. Checklist para máquina COM display (pronto para colar)

```bash
# 1. Sincronizar este branch (traz build-sidecar.sh + package.json corrigidos)
# 2. Rebuild limpo:
cd local-client && rm -rf dist-sidecar build-sidecar && ./build-sidecar.sh
cd ../electron && npm install --no-audit --no-fund
# 3. Dir + instaladores:
npx electron-builder --linux dir --publish never     # fumaça, sem instalador
npm run dist                                          # AppImage + .deb (exige ícone — ver item 2)
# 4. Smoke test visual (display real ou VM com vídeo):
./dist/linux-unpacked/relay-desktop                   # abre a web UI buildada?
curl -s http://127.0.0.1:9777/api/health            # {"status":"ok"} (sidecar empacotado)
ps aux | grep relay-server                            # 1 processo com o app aberto…
#    … feche pelo tray (Sair) e confirme: zero processos (sem zumbi)
# 5. Comportamentos: Ctrl+Shift+R com app em background, tray, 2ª instância
#    (foca a 1ª), sem mic → erro 400 amigável, auto-update logado em
#    ~/.config/Relay/sidecar.log, e ciclo N → N+1 com feed (ver checklist acima).

## Build final headless — 24/11/2026 (executado, sem display)

Pendências do item 2 resolvidas:
- Ícone: copiado `local-client/webui/public/icon-512.png` → `electron/assets/icon.png`
  e apontado `build.icon` para `assets/icon.png` (o path anterior `../../build/icon.png`
  não existia no repo).
- `homepage` adicionada ao `package.json` (exigida pelo target `deb`).
- `linux.syncDesktopName: true` + `desktopName: "Relay"` (associação janela↔taskbar,
  alinha com o `StartupWMClass` existente; warning zerado).

Artefatos (`electron/dist/`, build 24/11, sem display — NÃO testados visualmente):
- `Relay-0.1.0.AppImage` (290 MB) — sidecar embutido confirmado por extração
- `relay-desktop_0.1.0_amd64.deb` (265 MB) — contém `relay-server`, `webui-dist`,
  ícone 512 e `Relay.desktop`; verificado via `ar`+`tar -tf`
- `latest-linux.yml` gerado (base do auto-update; feed real = publicar release + `GH_TOKEN`)

O que continua exigindo máquina com display: item 4 e 5 acima, na íntegra.
```
