#!/usr/bin/env bash
# Relay Desktop — launcher padrão (Electron).
#
# O Python (FastAPI + web UI) é sidecar: o Electron sobe `python -m relay.webmain`.
# Este script só acha o shell certo e repassa a rota inicial.
#
# Ordem de resolução do binário:
#   1. $RELAY_ELECTRON_BIN
#   2. electron/dist/linux-unpacked/relay-desktop (build local)
#   3. electron/dist/Relay-*.AppImage (executável; o mais recente)
#   4. electron/node_modules/.bin/electron .  (dev, com aviso)
#   5. npx electron .                          (dev, com aviso)
# Sem nenhum deles: cai no app antigo (PySide com display; web sem display).
#
# Uso:
#   ./relay-electron.sh                  # janela normal
#   ./relay-electron.sh reviews          # abre direto em /reviews
#   ./relay-electron.sh --route=/board   # idem
#   ./relay-electron.sh --check          # só resolve e imprime o binário
#
# Log: ~/.config/Relay/launcher.log (respeita $XDG_CONFIG_HOME).

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/Relay"
LOG_FILE="$CONFIG_DIR/launcher.log"
mkdir -p "$CONFIG_DIR" 2>/dev/null || true

log() {
  printf '%s [relay-electron] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >>"$LOG_FILE" 2>/dev/null || true
}

warn() {
  log "AVISO: $*"
  printf 'relay-electron: %s\n' "$*" >&2
}

notify() {
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -a Relay "$1" "${2:-}" >/dev/null 2>&1 || true
  fi
}

usage() {
  sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# Normaliza "reviews", "/reviews", "relay://reviews" e "relay://board/5"
# para uma rota web "/reviews" / "/board/5".
normalize_route() {
  local raw="$1"
  raw="${raw#relay://}"
  raw="${raw#relay:/}"
  raw="${raw%%\?*}"
  raw="${raw%%#*}"
  raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  while [ "${raw#/}" != "$raw" ]; do raw="${raw#/}"; done
  raw="${raw%/}"
  printf '/%s' "$raw"
}

# Mesma regra do main.js: ^/[a-z0-9\-/]*$ (sem "." nem "_").
valid_route() {
  case "$1" in
    / | '') return 1 ;;
    /*) ;;
    *) return 1 ;;
  esac
  printf '%s' "$1" | grep -Eq '^/[a-z0-9/-]+$'
}

CHECK=0
ROUTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check | -c)
      CHECK=1
      ;;
    --route=* | --view=*)
      ROUTE="${1#*=}"
      ;;
    --route | --view)
      shift
      ROUTE="${1:-}"
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      [ $# -gt 0 ] && ROUTE="$1"
      ;;
    -*)
      warn "argumento ignorado: $1"
      ;;
    *)
      if [ -z "$ROUTE" ]; then
        ROUTE="$1"
      else
        warn "argumento extra ignorado: $1"
      fi
      ;;
  esac
  shift
done

# Argumentos extras do Electron (debug/profiling), ex.: RELAY_ELECTRON_ARGS="--remote-debugging-port=9222"
EXTRA_ARGS=()
if [ -n "${RELAY_ELECTRON_ARGS:-}" ]; then
  # shellcheck disable=SC2206
  EXTRA_ARGS=(${RELAY_ELECTRON_ARGS})
fi

if [ -n "$ROUTE" ]; then
  ROUTE="$(normalize_route "$ROUTE")"
  if ! valid_route "$ROUTE"; then
    warn "rota inválida ignorada: $ROUTE"
    ROUTE=""
  fi
fi

BIN_KIND=""
BIN_PATH=""
DEV_ARGS=()

resolve_bin() {
  # 1. Override explícito.
  if [ -n "${RELAY_ELECTRON_BIN:-}" ]; then
    if [ -x "$RELAY_ELECTRON_BIN" ]; then
      BIN_KIND="env"
      BIN_PATH="$RELAY_ELECTRON_BIN"
      return 0
    fi
    if command -v "$RELAY_ELECTRON_BIN" >/dev/null 2>&1; then
      BIN_KIND="env"
      BIN_PATH="$(command -v "$RELAY_ELECTRON_BIN")"
      return 0
    fi
    warn "RELAY_ELECTRON_BIN não é executável nem está no PATH: $RELAY_ELECTRON_BIN"
  fi

  # 2. Build local desempacotado (o mais previsível).
  local unpacked="$SCRIPT_DIR/dist/linux-unpacked/relay-desktop"
  if [ -x "$unpacked" ]; then
    BIN_KIND="unpacked"
    BIN_PATH="$unpacked"
    return 0
  fi

  # 3. AppImage mais recente — só se estiver executável.
  local appimage=""
  appimage="$(ls -1t "$SCRIPT_DIR"/dist/Relay-*.AppImage 2>/dev/null | head -n 1)"
  if [ -n "$appimage" ]; then
    if [ -x "$appimage" ]; then
      BIN_KIND="appimage"
      BIN_PATH="$appimage"
      return 0
    fi
    warn "AppImage encontrado mas sem permissão de execução: $appimage (rode chmod +x)"
  fi

  # 4. Dev com o electron local já instalado.
  local dev_electron="$SCRIPT_DIR/node_modules/.bin/electron"
  if [ -x "$dev_electron" ]; then
    BIN_KIND="dev-local"
    BIN_PATH="$dev_electron"
    DEV_ARGS=(".")
    return 0
  fi

  # 5. Dev via npx (pode baixar o electron na primeira execução).
  if command -v npx >/dev/null 2>&1; then
    BIN_KIND="dev-npx"
    BIN_PATH="$(command -v npx)"
    DEV_ARGS=("electron" ".")
    return 0
  fi

  return 1
}

if ! resolve_bin; then
  log "check=$CHECK rota=${ROUTE:-<padrão>}: nenhum binário Electron encontrado"
  if [ "$CHECK" = 1 ]; then
    echo "relay-electron: nenhum binário Electron encontrado" >&2
    exit 1
  fi
  # Rede de segurança: o usuário não pode ficar sem app.
  notify "Relay: app Electron indisponível" "Abrindo a versão anterior. Veja $LOG_FILE."
  if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && [ -x "$ROOT_DIR/local-client/run.sh" ]; then
    legacy_view=""
    case "$ROUTE" in
      /reunioes | /transcricoes | /meetings) legacy_view="reunioes" ;;
      /assistente | /chat) legacy_view="chat" ;;
      /configuracoes | /config | /settings) legacy_view="settings" ;;
      /guia | /guide) legacy_view="guide" ;;
      /vault | /senhas) legacy_view="vault" ;;
    esac
    log "FALLBACK PySide: $ROOT_DIR/local-client/run.sh ${legacy_view:+--view $legacy_view}"
    if [ -n "$legacy_view" ]; then
      exec "$ROOT_DIR/local-client/run.sh" --view "$legacy_view"
    fi
    exec "$ROOT_DIR/local-client/run.sh"
  fi
  if [ -x "$ROOT_DIR/local-client/relay-web.sh" ]; then
    log "FALLBACK web: $ROOT_DIR/local-client/relay-web.sh"
    exec "$ROOT_DIR/local-client/relay-web.sh"
  fi
  warn "nada para abrir: sem Electron, sem PySide e sem relay-web.sh"
  exit 1
fi

if [ "$CHECK" = 1 ]; then
  log "check: kind=$BIN_KIND bin=$BIN_PATH rota=${ROUTE:-<padrão>}"
  printf '%s\n' "$BIN_PATH"
  exit 0
fi

# Electron precisa de servidor gráfico; sem ele, o caminho útil é a web.
if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  warn "sem DISPLAY/WAYLAND_DISPLAY — Electron não abre janela; usando a web"
  notify "Relay sem sessão gráfica" "Abrindo a versão web em http://127.0.0.1:9777/"
  if [ -x "$ROOT_DIR/local-client/relay-web.sh" ]; then
    exec "$ROOT_DIR/local-client/relay-web.sh"
  fi
  warn "relay-web.sh não encontrado; o Electron provavelmente falhará sem display"
fi

ARGS=("${DEV_ARGS[@]+"${DEV_ARGS[@]}"}")
if [ -n "$ROUTE" ]; then
  ARGS+=("--route=$ROUTE")
fi

log "início: kind=$BIN_KIND bin=$BIN_PATH rota=${ROUTE:-<padrão>} args=${ARGS[*]:-<vazio>}"
case "$BIN_KIND" in
  env | unpacked | appimage)
    exec "$BIN_PATH" "${ARGS[@]+"${ARGS[@]}"}" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
    ;;
  dev-local | dev-npx)
    if [ "$BIN_KIND" = "dev-local" ]; then
      warn "modo dev: usando electron/node_modules/.bin/electron (sem build empacotado)"
    else
      warn "modo dev: usando npx electron (sem build empacotado; pode baixar na 1ª vez)"
    fi
    cd "$SCRIPT_DIR" || exit 1
    exec "$BIN_PATH" "${ARGS[@]+"${ARGS[@]}"}" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
    ;;
  *)
    warn "tipo de binário desconhecido: $BIN_KIND"
    exit 1
    ;;
esac
