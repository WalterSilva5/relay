# Prints para os READMEs

Este diretório vai guardar as capturas de tela do app **Electron** (shell + web UI
React). As imagens usadas hoje nos READMEs são da **GUI Qt antiga**
(`local-client/docs/screenshots/`, capturadas em jul/2026) e **serão substituídas**.

## Estado atual

- Nenhum print novo foi capturado ainda: o ambiente usado no desenvolvimento é
  headless e as capturas saíram pretas (monitores desligados). O registro está em
  [`../e3-packaging.md`](../e3-packaging.md).
- Os READMEs da raiz (`README.md` e `README.en.md`) já apontam para cá e
  rebaixaram as imagens antigas para um bloco recolhido, marcado como legado.
- Até a recaptura, as imagens antigas continuam em `local-client/docs/screenshots/`
  como referência histórica — não representam mais a UI principal.

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
# caminho principal (Electron)
cd local-client && ./install.sh
cd ../electron && npm install && npm run dev

# alternativa no navegador
cd local-client && ./run-web.sh   # http://127.0.0.1:9777/
```

## Os 5 prints essenciais

| # | Arquivo | Tela / rota | Estado que deve exibir |
|---|---|---|---|
| 1 | `dashboard.png` | `/dashboard` | Visão geral com Pomodoro, cards de resumo (ativas, concluídas, vencidas, em progresso), tarefas vencidas, atividade recente e progresso por projeto. Popular com 2+ projetos. |
| 2 | `board.png` | `/board/<projectId>` | Kanban com as colunas Backlog / A fazer / Fazendo / Revisão / Concluído, cards com tipo, prioridade e labels, seletor de sprint visível e pelo menos um card em Revisão com o indicador de code review. |
| 3 | `metricas.png` | `/metricas` | Cards de total, concluídas (7/30 dias), lead time e cycle time; gráfico de throughput das últimas 8 semanas; breakdown por tipo e prioridade. |
| 4 | `reviews-pr.png` | `/reviews-pr` | Documento de review de PR preenchido: URL do PR, veredito, checagens marcadas (base/`merge-base`, conflito, testes, paridade, multi-tenant) e o diff resumido, com os botões de exportar/enviar visíveis. |
| 5 | `reunioes.png` | `/reunioes` | Fluxo **Destino → 1 Preparar → 2 Gravar → 3 Resultado** com o copiloto ao vivo: abas Plano · Dicas · Ações · Decisões · Perguntas preenchidas e a transcrição ao lado. |

## Checklist antes de publicar

- [ ] Os 5 arquivos existem em `docs/prints/` com os nomes da tabela.
- [ ] Nenhum dado sensível visível (projeto/workspace de demonstração).
- [ ] Janela em 1440×900, tema claro, sem notificações ou overlays do sistema.
- [ ] READMEs atualizados para exibir as novas imagens e remover a nota de "capturas pendentes".
- [ ] Imagens antigas da GUI Qt removidas de `local-client/docs/screenshots/` (ou mantidas apenas se ainda forem úteis para histórico).

## Status (25/11/2026)

Capturados do app Electron empacotado (1440×900, tema claro, projeto MIG) e já
usados no README: `dashboard.png`, `board.png`, `metricas.png`,
`reviews-pr.png`, `reunioes.png`. Recapturar quando a UI mudar de forma
relevante. Como recapturar sem monitor ligado: subir o app com
`RELAY_ELECTRON_ARGS="--remote-debugging-port=9222" ./electron/relay-electron.sh`
e usar CDP (`Page.captureScreenshot` após navegar para a rota).
