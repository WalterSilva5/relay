# Prints para os READMEs

Este diretório contém as capturas atuais do app **Electron** (shell + web UI
React). As imagens antigas da GUI Qt continuam em
`local-client/docs/screenshots/` apenas como referência histórica — não
representam mais a UI principal.

## Estado atual (26/11/2026)

- Os 5 prints essenciais foram recapturados do app Electron empacotado
  (1440×900, tema claro, projeto MIG) e já são usados em `README.md` e
  `README.en.md`.
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
| Conteúdo | projeto de demonstração, sem dados reais/sensíveis (nomes, e-mails, tokens) |
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
| 1 | `dashboard.png` | `/dashboard` | KPIs (tarefas, entregues, lead/cycle time), digest do standup, atividade recente e projetos do workspace. Menu com Board primeiro e itens com borda. |
| 2 | `board.png` | `/board/<projectId>` | Kanban horizontal com filtros, seletor de sprint, colunas com WIP/contagem, cards com tipo/prioridade/labels, selects de sprint/responsável e o botão **Mostrar mais** nas colunas grandes. |
| 3 | `metricas.png` | `/metricas` | Cards de total, entregues, concluídas (7/30 dias), lead time e cycle time; throughput semanal; distribuição por tipo/prioridade e por projeto. |
| 4 | `reviews-pr.png` | `/reviews-pr` | Pasta de destino, criação por URL de PR, filtros e tabela de reviews. O print pode estar no estado vazio (“Nenhum review.”); o fluxo completo abre o formulário abaixo da tabela. |
| 5 | `reunioes.png` | `/reunioes` | Lista de gravações e detalhe com contexto (projeto ou workshop), botões **Transcrever**/**Analisar reunião**, abas Resumo/Transcrição/Seções/Áudio e ações de exportar/arquivar/excluir. |

## Checklist antes de publicar

- [x] Os 5 arquivos existem em `docs/prints/` com os nomes da tabela.
- [x] Nenhum dado sensível visível (projeto/workspace de demonstração).
- [x] Janela em 1440×900, tema claro, sem notificações ou overlays do sistema.
- [x] READMEs atualizados para exibir as imagens atuais e remover a nota de “capturas pendentes”.
- [ ] Imagens antigas da GUI Qt removidas de `local-client/docs/screenshots/` (mantidas por histórico).

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
