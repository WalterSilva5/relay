#!/usr/bin/env bash
# Instala os atalhos do Relay Desktop (Electron) no menu do usuário.
#
# O que faz:
#   ~/.local/share/applications/relay.desktop      -> electron/relay-electron.sh
#   ~/.local/share/applications/relay-url.desktop  -> relay-open.sh %u (relay://)
#   registra relay:// como handler (xdg-mime) e atualiza o cache do menu.
#   remove o relay-web.desktop antigo (apontava para o launcher web) para não
#   deixar duas entradas iguais no menu.
#
# Uso:
#   ./install-desktop.sh              # instala/atualiza
#   ./install-desktop.sh --uninstall  # remove os atalhos deste repo
#
# Não precisa de root: tudo vai para o diretório do usuário.

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LAUNCHER="$SCRIPT_DIR/relay-electron.sh"
OPEN_SCRIPT="$ROOT_DIR/local-client/relay-open.sh"
ICON="$SCRIPT_DIR/assets/icon.png"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
MAIN_DESKTOP="$APPS_DIR/relay.desktop"
URL_DESKTOP="$APPS_DIR/relay-url.desktop"
LEGACY_WEB="$APPS_DIR/relay-web.desktop"
BACKUP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/relay-desktop-backup"

if [ ! -x "$LAUNCHER" ]; then
  echo "Erro: $LAUNCHER não existe ou não é executável." >&2
  echo "Rode: chmod +x $LAUNCHER" >&2
  exit 1
fi
if [ ! -x "$OPEN_SCRIPT" ]; then
  echo "Erro: $OPEN_SCRIPT não existe ou não é executável." >&2
  exit 1
fi

refresh_menu() {
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
  fi
}

# Guarda a versão anterior antes de sobrescrever (uma cópia por instalação).
backup_existing() {
  local file="$1"
  [ -f "$file" ] || return 0
  mkdir -p "$BACKUP_DIR"
  local stamp
  stamp="$(date '+%Y%m%d-%H%M%S')"
  cp -f "$file" "$BACKUP_DIR/$(basename "$file").$stamp" 2>/dev/null || true
}

remove_if_ours() {
  local file="$1"
  [ -f "$file" ] || return 0
  if grep -qF "$ROOT_DIR" "$file" 2>/dev/null; then
    rm -f "$file"
    echo "removido: $file"
  fi
}

if [ "${1:-}" = "--uninstall" ]; then
  remove_if_ours "$MAIN_DESKTOP"
  remove_if_ours "$URL_DESKTOP"
  remove_if_ours "$LEGACY_WEB"
  refresh_menu
  echo ""
  echo "Atalhos removidos. Se relay:// parar de abrir, redefina o handler:"
  echo "  xdg-mime default <outro-app>.desktop x-scheme-handler/relay"
  if [ -d "$BACKUP_DIR" ]; then
    echo ""
    echo "Versões anteriores (copie de volta se quiser o atalho antigo): $BACKUP_DIR"
  fi
  exit 0
fi

mkdir -p "$APPS_DIR"
backup_existing "$MAIN_DESKTOP"
backup_existing "$URL_DESKTOP"
backup_existing "$LEGACY_WEB"

cat >"$MAIN_DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Relay
Comment=Relay Desktop (Electron) — tarefas, reuniões e memória local
Exec=$LAUNCHER
Path=$ROOT_DIR
Icon=$ICON
Terminal=false
Categories=Development;
StartupWMClass=Relay
EOF
chmod 644 "$MAIN_DESKTOP"

cat >"$URL_DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Relay (abrir tela)
Comment=Abre o Relay Desktop numa tela específica via links relay://
Exec=$OPEN_SCRIPT %u
Path=$ROOT_DIR
Icon=$ICON
Terminal=false
Categories=Development;
MimeType=x-scheme-handler/relay;
NoDisplay=true
EOF
chmod 644 "$URL_DESKTOP"

# O atalho web antigo virava uma segunda entrada igual no menu.
remove_if_ours "$LEGACY_WEB"

refresh_menu
if command -v xdg-mime >/dev/null 2>&1; then
  xdg-mime default relay-url.desktop x-scheme-handler/relay >/dev/null 2>&1 || true
fi

echo "Instalado:"
echo "  $MAIN_DESKTOP"
echo "  $URL_DESKTOP"
if [ -d "$BACKUP_DIR" ] && [ -n "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
  echo ""
  echo "Versões anteriores guardadas em: $BACKUP_DIR"
fi
echo ""
echo "Launcher: $LAUNCHER"
echo "Links:    relay://reunioes  relay://board/12  relay://reviews  relay://vault"
echo "Log:      ${XDG_CONFIG_HOME:-$HOME/.config}/Relay/launcher.log"
