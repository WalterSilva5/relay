#!/usr/bin/env bash
# Relay — build do sidecar Python (binário único via PyInstaller).
#
# Gera: local-client/dist-sidecar/relay-server (one-file, a partir de relay.webmain)
# Uso:  cd local-client && ./build-sidecar.sh
#
# Pré-requisitos (passo manual se faltar — NÃO rode npm aqui):
#   1. .venv ativo com as deps de runtime instaladas (pip install -e .).
#   2. PyInstaller instalado:  pip install pyinstaller
#      (valide com: pyinstaller --version)
#   3. (Opcional, p/ servir a web UI) webui buildada em local-client/webui/dist
#      — este script a copia para dist-sidecar/webui-dist, ao lado do binário.
#
# Notas de empacotamento:
# - O entrypoint é relay.webmain (só API+web, sem QApplication) — o binário
#   NÃO embute Qt: PySide6/shiboken6 são excluídos (corta ~200 MB).
# - faster-whisper/ctranslate2/onnxruntime são CPU-only aqui: excluímos os
#   pacotes CUDA da NVIDIA (nvidia-*, cupy, triton, xformers) e o suporte a
#   GPU do torch, caso algum dia entre como dependência transitiva.
#   Os modelos Whisper NÃO vão no binário — são baixados em runtime para
#   ~/.cache (ver relay/transcricoes/transcriber.py).
# - A web UI é resolvida em runtime por relay/api/app.py::_mount_webui como
#   <repo>/local-client/webui/dist. No empacotado, o Electron coloca
#   dist-sidecar/ em resources/sidecar/ — por isso copiamos webui/dist para
#   ao lado do binário e documentamos em docs/e3-packaging.md o ajuste de
#   path (ou RELAY_WEBUI_DIR) se o mount não achar.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# Garante o .venv local no PATH (pyinstaller + python do venv).
# Sem isso, `command -v pyinstaller` e `python3 -c "import relay..."`
# usam o Python do sistema e o build falha mesmo com tudo instalado.
if [ -d "$HERE/.venv/bin" ]; then
  export PATH="$HERE/.venv/bin:$PATH"
fi

OUT_DIR="$HERE/dist-sidecar"
BIN_NAME="relay-server"

# 0. Checagens ---------------------------------------------------------------
if ! command -v pyinstaller >/dev/null 2>&1; then
  echo "ERRO: PyInstaller não instalado." >&2
  echo "Passo manual: pip install pyinstaller  &&  pyinstaller --version" >&2
  exit 1
fi
echo "PyInstaller: $(pyinstaller --version)"

if ! python3 -c "import relay.webmain" 2>/dev/null; then
  echo "ERRO: relay.webmain não importável — ative o .venv e rode: pip install -e ." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# 1. Build one-file ----------------------------------------------------------
# Alvo: relay/webmain.py rodado como __main__ (equivale a python -m relay.webmain).
# --paths garante que o pacote `relay` seja resolvido a partir daqui.
# --exclude-module: corta Qt/GUI e GPU (o sidecar é headless).
# --collect-data: garante metadata/pacotes de dados de runtime que o
#   PyInstaller às vezes não detecta (sqlalchemy/uvicorn/fastapi).
pyinstaller \
  --noconfirm \
  --clean \
  --onefile \
  --name "$BIN_NAME" \
  --distpath "$OUT_DIR" \
  --workpath "$HERE/build-sidecar" \
  --specpath "$HERE/build-sidecar" \
  --paths "$HERE" \
  --exclude-module PySide6 \
  --exclude-module shiboken6 \
  --exclude-module tkinter \
  --exclude-module torch \
  --exclude-module triton \
  --exclude-module xformers \
  --exclude-module cupy \
  --exclude-module nvidia \
  --collect-data sqlalchemy \
  --collect-data uvicorn \
  --collect-data fastapi \
  --hidden-import uvicorn.logging \
  --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import faster_whisper \
  --hidden-import ctranslate2 \
  --hidden-import onnxruntime \
  relay/webmain.py

# 2. Web UI ao lado do binário -----------------------------------------------
if [ -d "$HERE/webui/dist" ]; then
  rm -rf "$OUT_DIR/webui-dist"
  cp -r "$HERE/webui/dist" "$OUT_DIR/webui-dist"
  echo "webui/dist copiada para $OUT_DIR/webui-dist"
else
  echo "AVISO: webui/dist ausente — o sidecar servirá só a API."
  echo "Para incluir: builde a web UI em local-client/webui/dist e rode de novo."
fi

# 3. Smoke test ---------------------------------------------------------------
"$OUT_DIR/$BIN_NAME" --help >/dev/null 2>&1 || true
echo "OK: $OUT_DIR/$BIN_NAME"
ls -lh "$OUT_DIR/$BIN_NAME"
echo "Teste manual: PORTA livre? rode: $OUT_DIR/$BIN_NAME --port 9777"
echo "(esperado: 'Relay web + API em http://127.0.0.1:9777/')"
