# ADR-0001 — Unificação no Electron (shell web + sidecar Python)

Data: 2026-11-24 · Status: aprovado para spike (E1)

## Contexto

O Relay tem hoje duas UIs (PySide6 e React `webui`) e a versão web está
visivelmente melhor. Manter as duas dobra o custo de cada feature. O backend
(FastAPI + SQLite + LangGraph + faster-whisper) já é UI-agnóstico e serve a
`webui/dist` na mesma origem.

## Decisão

Unificar no **Electron com a `webui` React existente**, mantendo o **Python
como sidecar** (o Electron sobe o FastAPI no boot e fala HTTP com ele):

- Electron = shell fino: janela, tray, single-instance, autostart,
  `globalShortcut`, notificações, `desktopCapturer`, auto-update.
- Python continua dono de: API, SQLite, agente, transcrição (parec +
  faster-whisper), sync Obsidian, backup.
- Nada de acesso direto ao banco fora do processo Python (regra de corte:
  só `api/` e `db/` tocam o SQLite; fiscalizado em CI).

## Alternativas descartadas

- **Tauri**: binário menor, mas exige Rust nas partes nativas e o suporte a
  hotkeys/captura no Linux/Wayland é mais áspero. Não compensa para um app
  local single-user.
- **PWA**: sem tray, sem hotkey global, sem acesso local equivalente.
- **Manter PySide**: perpetua o custo de duas UIs e o empacotamento Qt.
- **Reescrever backend em Node/Rust**: descarta LangGraph, Whisper e ~500
  testes sem ganho proporcional.

## Empacotamento (E3)

- Sidecar: **PyInstaller one-file, CPU-only** (torch CUDA excluído —
  inviabilizaria o instalador). Modelos Whisper baixados sob demanda, como hoje.
- Instalador: **electron-builder — AppImage + .deb** primeiro; Windows depois.
- Update: **electron-updater** via GitHub Releases, mesmo versionamento app+sidecar.
- Fallback de dev: Electron usa o Python do `.venv` (`ELECTRON_USE_SYSTEM_PYTHON=1`
  ou detecção automática quando o binário empacotado não existir).

## Alvos

- Fase 1–3: **Linux** (X11 + Wayland; quirks de portal documentados no spike).
- Depois: Windows. macOS fora do escopo até segunda ordem.

## Legado

- `gui/` (PySide): congela após a paridade por view (E2), remove após 1 release
  com aviso. `python -m relay` vira modo headless (só API).
- `web-client/` (NestJS+Angular): congelado agora; fora do CI assim que o
  Electron empacotar (E3).

## Riscos assumidos

1. Bundle PyInstaller+torch pode passar de 500MB — mitigar excluindo CUDA e
   baixando modelos sob demanda.
2. Wayland: hotkeys/captura dependem de portal/permissão — spike E1 valida
   antes do grosso (E2).
3. Áudio do sistema (loopback PipeWire) fica no sidecar — risco ~zero, pois
   o código já funciona headless (`RecordingSession` não depende de Qt).
