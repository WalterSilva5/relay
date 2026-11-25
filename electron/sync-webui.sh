#!/usr/bin/env bash
# Sincroniza o build fresco da web UI (local-client/webui/dist) para as cópias
# usadas pelo app empacotado e pelo sidecar standalone.
#
# Por que existe: o pacote Electron embarca uma CÓPIA da web UI
# (`resources/sidecar/webui-dist`). Sem sincronizar, o app instalado continua
# mostrando o bundle antigo mesmo depois de `npm run build`.
#
# Uso:
#   ./electron/sync-webui.sh            # copia para os destinos existentes
#   ./electron/sync-webui.sh --check    # só reporta divergências (exit 1 se houver)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/local-client/webui/dist"
DESTINOS=(
  "$ROOT/local-client/dist-sidecar/webui-dist"
  "$ROOT/electron/dist/linux-unpacked/resources/sidecar/webui-dist"
)

[ -f "$SRC/index.html" ] || { echo "build não encontrado: $SRC (rode 'cd local-client/webui && npm run build')"; exit 1; }

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

divergiu=0
for dst in "${DESTINOS[@]}"; do
  [ -d "$dst" ] || { echo "skip (não existe): ${dst#$ROOT/}"; continue; }
  if diff -rq "$SRC" "$dst" >/dev/null 2>&1; then
    echo "ok: ${dst#$ROOT/}"
  else
    divergiu=1
    if [ "$CHECK" = "1" ]; then
      echo "DIVERGE: ${dst#$ROOT/}"
    else
      rm -rf "$dst" && mkdir -p "$dst" && cp -a "$SRC/." "$dst/"
      echo "sincronizado: ${dst#$ROOT/}"
    fi
  fi
done

if [ "$CHECK" = "1" ] && [ "$divergiu" = "1" ]; then
  echo "há cópias desatualizadas — rode ./electron/sync-webui.sh"
  exit 1
fi
