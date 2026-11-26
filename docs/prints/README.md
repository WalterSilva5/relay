# Prints para os READMEs

Este diretório contém as capturas atuais do app **Electron** (shell + web UI
React). As imagens antigas da GUI Qt continuam em
`local-client/docs/screenshots/` apenas como referência histórica — não
representam mais a UI principal.

## Estado atual (26/11/2026)

- Os 5 prints essenciais foram recapturados do app Electron empacotado
  (1440×900, tema claro, **workspace Exemplo / projeto Portal do Cliente — DEMO**)
  e já são usados em `README.md` e `README.en.md`.
- A captura reflete o design system v2: menu com **Board primeiro**, itens com
  borda, paleta azul corporativa de alto contraste.
- O Electron limpa o cache da UI a cada boot; se uma janela antiga continuar
  aberta, feche pela bandeja (**Sair**) e abra de novo antes de capturar.

## Padrão de captura

| Item | Valor |
|---|---|
| Resolução | **1440×900** (janela do app nesse tamanho; sem barras do sistema) |
| Tema | claro (dark é opcional, sufixo `-dark`) |
| Formato | PNG otimizado, mesmo nome do arquivo da tabela abaixo |
| Conteúdo | **workspace Exemplo**, projeto **Portal do Cliente (DEMO)**; tarefas, pessoas, reunião e review fictícios, sem dados reais/sensíveis |
| Onde salvar | `docs/prints/` (este diretório) |

Como abrir o app para capturar:

```bash
# caminho principal (Electron) — use o build local atualizado
RELAY_ELECTRON_ARGS="--remote-debugging-port=9222" ./electron/relay-electron.sh

# alternativa no navegador (mesma API/web UI)
cd local-client && ./run-web.sh   # http://127.0.0.1:9777/
```

## Os 5 prints essenciais

| # | Arquivo | Tela / rota | Estado que deve exibir |
|---|---|---|---|
| 1 | `dashboard.png` | `/dashboard` | Workspace Exemplo com KPIs (26 tarefas, 7 entregues, lead/cycle de 144h), digest do standup, atividade recente de tarefas fictícias e o projeto Portal do Cliente. Menu com Board primeiro e itens com borda. |
| 2 | `board.png` | `/board/<projectId>` | Board do projeto Portal do Cliente (DEMO), sprint 12 ativa, colunas To do/Approved/Refinement/Ready for Dev populadas, cards com prioridade, labels, avatar, sprint, responsável e previsão de entrega. |
| 3 | `metricas.png` | `/metricas` | KPIs do workspace Exemplo (26 tarefas, 7 entregues, 3 concluídas, lead/cycle de 144h), throughput semanal e distribuição por tipo/prioridade. |
| 4 | `reviews-pr.png` | `/reviews-pr` | Review fictício do PR #128 (`portal/web`, autoria Ana Souza), com veredito “Aprovar com sugestões” e status Rascunho, além dos cards de pasta de destino e novo review. |
| 5 | `reunioes.png` | `/reunioes` | Duas reuniões fictícias: “Daily de produto — 25/11” (contexto do projeto Portal do Cliente, com resumo e seções) e “Workshop: descoberta de melhorias” (sem projeto). |

## Checklist antes de publicar

- [x] Os 5 arquivos existem em `docs/prints/` com os nomes da tabela.
- [x] Nenhum dado sensível visível (projeto/workspace de demonstração).
- [x] Janela em 1440×900, tema claro, sem notificações ou overlays do sistema.
- [x] READMEs atualizados para exibir as imagens atuais e remover a nota de “capturas pendentes”.
- [ ] Imagens antigas da GUI Qt removidas de `local-client/docs/screenshots/` (mantidas por histórico).

## Dados de demonstração

Os prints usam o workspace **Exemplo** (criado localmente fora do repositório) e o
projeto **Portal do Cliente** (`DEMO`). Ele contém 26 tarefas fictícias em 12
colunas, duas sprints, labels, quatro pessoas, duas reuniões e um review de PR.
Nenhum dado real do workspace GAV entra nos prints.

Ao terminar a captura, volte o workspace ativo para **GAV** (`POST
/api/workspaces/active` com `{"id":"gav"}`) e reinicie o app. O workspace Exemplo
permanece disponível para recapturas futuras.

## Como recapturar

```bash
# 1. build da web UI e sincronização com o pacote Electron
cd local-client/webui && npm run build && cd ../..
./electron/sync-webui.sh

# 2. app com CDP, prints em 1440×900
RELAY_ELECTRON_ARGS="--remote-debugging-port=9222" ./electron/relay-electron.sh
python3 local-client/webui/scripts/ui-shot.py \
  /dashboard,/board,/metricas,/reunioes,/reviews-pr /tmp/ui-prints 1440 6
cp /tmp/ui-prints/1440/*.png docs/prints/
```

O script usa CDP (`Page.captureScreenshot`) após navegar para cada rota. Em
janela oculta, finalize as transições CSS com
`document.getAnimations().forEach(a => a.finish())` antes do print. Se o app
estiver empacotado, rode `./electron/sync-webui.sh` antes de abrir; o Electron
também limpa o cache HTTP/service worker no boot.
