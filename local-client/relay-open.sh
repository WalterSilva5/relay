#!/bin/bash
# Abre o Relay Desktop (Electron) numa tela específica via links relay://.
# Ex.: relay://reunioes  ->  /reunioes
#      relay://board/12  ->  /board/12
#      relay://vault     ->  /configuracoes + aviso (o cofre ainda não tem tela web)
# Uso (registrado via relay-url.desktop):
#     relay-open "relay://reunioes"
#
# Se o launcher do Electron não existir, cai no app antigo (PySide) com --view.
set -eu

URL="${1:-relay://dashboard}"
URL_LC="$(printf '%s' "$URL" | tr '[:upper:]' '[:lower:]')"
RAW="${URL_LC#relay://}"
RAW="${RAW#relay:/}"
RAW="${RAW%%\?*}"
RAW="${RAW%%#*}"
while [ "${RAW#/}" != "$RAW" ]; do RAW="${RAW#/}"; done

SEG="${RAW%%/*}"
REST=""
if [ "$SEG" != "$RAW" ]; then
  REST="/${RAW#*/}"
fi

AVISO=""
case "$SEG" in
  vault | senhas | passwords | cofre)
    ROUTE="/configuracoes"
    AVISO="O cofre de senhas ainda não tem tela na versão web; abrindo Configurações."
    ;;
  reunioes | reuniões | transcricoes | transcrições | meetings | transcriptions)
    ROUTE="/reunioes"
    ;;
  config | settings | configuracoes | configurações)
    ROUTE="/configuracoes"
    ;;
  board | kanban)
    ROUTE="/board${REST}"
    ;;
  reviews | revisoes | revisões)
    ROUTE="/reviews${REST}"
    ;;
  reviews-pr | pr-reviews | pr | pull-requests)
    ROUTE="/reviews-pr${REST}"
    ;;
  chat | assistente | assistant)
    ROUTE="/assistente"
    ;;
  projetos | projects)
    ROUTE="/projetos${REST}"
    ;;
  meu-dia | daily | diario | diário)
    ROUTE="/meu-dia"
    ;;
  estudos | study)
    ROUTE="/estudos"
    ;;
  metricas | métricas | metrics)
    ROUTE="/metricas"
    ;;
  time | equipe)
    ROUTE="/time"
    ;;
  todos | todo)
    ROUTE="/todos"
    ;;
  labels | etiquetas)
    ROUTE="/labels"
    ;;
  biblioteca | library)
    ROUTE="/biblioteca"
    ;;
  ferramentas | tools)
    ROUTE="/ferramentas"
    ;;
  memoria | memória | memory)
    ROUTE="/memoria"
    ;;
  ingles | inglês | english)
    ROUTE="/ingles"
    ;;
  skills)
    ROUTE="/skills"
    ;;
  guia | guide)
    ROUTE="/guia"
    ;;
  traducao | tradução | translation)
    ROUTE="/traducao"
    ;;
  techlinks)
    ROUTE="/techlinks"
    ;;
  goals | objetivos)
    ROUTE="/goals"
    ;;
  api-tester | apitester)
    ROUTE="/api-tester"
    ;;
  base)
    ROUTE="/base"
    ;;
  dashboard | inicio | início | home | '')
    ROUTE="/dashboard"
    ;;
  *)
    ROUTE="/${RAW}"
    ;;
esac

if [ -n "$AVISO" ]; then
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -a Relay "Relay" "$AVISO" >/dev/null 2>&1 || true
  fi
  echo "relay-open: $AVISO" >&2
fi

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$APP_DIR/.." && pwd)"
LAUNCHER="$ROOT_DIR/electron/relay-electron.sh"

if [ -x "$LAUNCHER" ]; then
  exec "$LAUNCHER" --route="$ROUTE"
fi

# Rede de segurança: launcher do Electron ausente → comportamento antigo.
echo "relay-open: $LAUNCHER não encontrado; usando o app antigo" >&2
if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  echo "relay-open: sem sessão gráfica (DISPLAY/WAYLAND_DISPLAY ausentes)" >&2
  exit 1
fi

case "$ROUTE" in
  /reunioes) VIEW=reunioes ;;
  /assistente) VIEW=chat ;;
  /configuracoes) VIEW=settings ;;
  /guia) VIEW=guide ;;
  /senhas) VIEW=vault ;;
  *) VIEW="" ;;
esac

if [ -n "$VIEW" ]; then
  exec "$APP_DIR/run.sh" --view "$VIEW"
fi
exec "$APP_DIR/run.sh"
