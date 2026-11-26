# Relay Desktop (Electron) — spike E1

Shell fino sobre a web UI React + sidecar Python. O Electron **não**
reimplementa nada: janela, tray, hotkey global e ciclo de vida; todo o
produto continua no FastAPI (`local-client/`).

## Como iniciar (caminho padrão)

O launcher oficial é `electron/relay-electron.sh`. Ele resolve o binário nesta
ordem e repassa a rota inicial, se houver:

1. `$RELAY_ELECTRON_BIN` (override explícito)
2. `electron/dist/linux-unpacked/relay-desktop` (build local)
3. `electron/dist/Relay-*.AppImage` — só se estiver executável (`chmod +x`)
4. `electron/node_modules/.bin/electron .` (dev, com aviso)
5. `npx electron .` (dev, com aviso)

Sem nenhum binário, o script cai no app antigo (PySide com display, web sem
display) e registra o motivo em `~/.config/Relay/launcher.log` — o usuário não
fica sem app.

```bash
cd electron
./relay-electron.sh                  # janela normal
./relay-electron.sh reviews          # abre em /reviews
./relay-electron.sh --route=/board   # idem
./relay-electron.sh --check          # só resolve e imprime o binário
```

Para instalar no menu do usuário, registrar `relay://` e iniciar o Electron no login:

```bash
./install-desktop.sh                 # menu + relay:// + autostart do login
./install-desktop.sh --no-autostart  # só menu/URL, sem mexer no login
./install-desktop.sh --uninstall     # remove atalhos e autostart deste repo
```

O autostart é gravado em `~/.config/autostart/relay.desktop` apontando para
`electron/relay-electron.sh` (o mesmo launcher do menu). Se você já tinha o app
PySide configurado para iniciar no login, rodar o instalador substitui aquela
entrada — o backup fica em `~/.local/share/relay-desktop-backup/`.

Links `relay://` são traduzidos por `local-client/relay-open.sh`:

| link | destino |
|---|---|
| `relay://reunioes` | `/reunioes` |
| `relay://board/12` | `/board/12` |
| `relay://reviews` | `/reviews` |
| `relay://vault` (ou `senhas`) | `/configuracoes` + aviso (cofre ainda não tem tela web) |

Com o app já aberto, o link vira navegação na janela existente
(`second-instance` no `main.js`).

**Reverter para o caminho antigo:** rode `local-client/run.sh` (PySide) ou
`local-client/relay-web.sh` (navegador) diretamente e, se instalou os atalhos,
`electron/install-desktop.sh --uninstall` (as entradas antigas ficam em
`~/.local/share/relay-desktop-backup/`). Nada no código precisa mudar — o
Electron não substitui os scripts antigos, só passa a ser o padrão.

## Rodar em dev

```bash
# 1. API + webui (terminal 1)
cd local-client && .venv/bin/python -m relay.webmain --port 9777

# 2. shell (terminal 2) — precisa do npm install antes (só na 1ª vez)
cd electron && npm install
ELECTRON_URL=http://127.0.0.1:9777 npm run dev
```

Variáveis úteis:

| var | efeito |
|---|---|
| `ELECTRON_URL` | URL do renderer (padrão: `http://127.0.0.1:9777`; use `http://localhost:3000` com `vite` rodando) |
| `RELAY_PORT` | porta do sidecar (padrão 9777) |
| `RELAY_PYTHON` | binário do sidecar (padrão: `resources/sidecar/relay-server` empacotado, senão `.venv` de dev, senão `python3`) |
| `RELAY_AUTOSTART=1` | registra autostart do SO |
| `ELECTRON_DEV=1` | abre DevTools detached |

Sem `ELECTRON_URL` **e** sem servidor rodando, o `npm run dev` sobe o
sidecar sozinho a partir do `.venv` de dev.

## Empacotar (E3, esqueleto pronto)

```bash
cd electron && npm run pack   # pasta dist/ sem instalador
cd electron && npm run dist   # AppImage + .deb (Linux)
```

O `extraResources.sidecar/` espera o binário PyInstaller
(`local-client/dist-sidecar/relay-server`) — ainda não gerado (tarefa E3).

## Atalhos e comportamento

- `Ctrl+Shift+R`: alterna gravação ao vivo (`POST /api/recordings/live/...`)
  com notificação do resultado.
- Fechar a janela minimiza para o tray (app residente); sair é pelo tray.
- Segunda instância foca a janela existente (single-instance lock).
- Log do sidecar em `~/.config/Relay/sidecar.log` (+ item "Abrir log" no tray).

## Checklist de validação (máquina real — sem display/mic aqui no CI)

- [ ] Instala e abre (X11 e Wayland)
- [ ] Tray aparece com menu; fechar minimiza; Sair mata o sidecar (sem zumbi: `ps aux | grep webmain`)
- [ ] `Ctrl+Shift+R` grava/para com o app em background (notificação confirma)
- [ ] Sem mic/PipeWire: erro amigável (400), sem crash
- [ ] `ELECTRON_URL` apontando pro vite: hot-reload funciona
- [ ] `desktopCapturer` lista telas (base para captura futura)
- [ ] Segunda instância foca a primeira em vez de abrir outra

## Limites conhecidos do spike

- Sem ícone próprio (usa fallback; E3 gera `build/icon.png`).
- Sem auto-update (E3, `electron-updater`).
- Sem empacotamento do Python (usa `.venv` de dev ou `RELAY_PYTHON`).
