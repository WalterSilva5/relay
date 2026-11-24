# Relay Desktop (Electron) — spike E1

Shell fino sobre a web UI React + sidecar Python. O Electron **não**
reimplementa nada: janela, tray, hotkey global e ciclo de vida; todo o
produto continua no FastAPI (`local-client/`).

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
