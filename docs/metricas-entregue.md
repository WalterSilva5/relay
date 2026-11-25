# Métricas — regra "entregue" no % Finalizado

Documento de referência da regra aplicada no commit `7d2a51a` e da auditoria de
consistência feita depois dela. Vale para a API, a GUI PySide e a webui.

## A regra

**Entregue = coluna de conclusão formal (`is_done`) + estágios de teste/aceite.**

Um card que já passou pelo desenvolvimento e entrou em teste conta no
`% Finalizado`, mesmo que o aceite final (`Done`) ainda não tenha acontecido.
O ponto de verdade é `relay/dimensions.py::delivered_ids` (e o agregado por
projeto `delivered_ids_by_project`).

### Colunas que contam

| Origem | Nomes reconhecidos |
|---|---|
| Conclusão formal | qualquer coluna com `is_done = true` (normalmente `Done`/`Feito`) |
| Teste | `In Test`, `Em teste`, `In Testes`, `Em testes` |
| Verificação | `Verified`, `Verificado`, `Verificada` |
| Aceite | `Accepted`, `Aceito`, `Aceita` |

O nome é normalizado (minúsculas, sem acento, sem espaços/pontuação), então
`In Test`, `in test` e `EM TESTE` são a mesma coisa. **`Rework` não conta**:
é card que voltou do teste.

Há duas leituras de progresso, sempre separadas:

- **`developed`** — card em `Dev Box` ou em qualquer coluna depois dela
  (desenvolvimento concluído). Sem `Dev Box` no board, cai na coluna de
  conclusão formal.
- **`done`** — entregue pela regra acima (`Done` + teste/aceite).

## Antes × depois no workspace real

Coleta em **25/11/2026** pela API local (`http://127.0.0.1:9777`), workspace
**`gav`**, projeto **`MIG` — VAR 3.0 - Migração GX** (`projectId = 1`).

### Board do MIG

| Coluna | Cards | Conta como |
|---|---:|---|
| To do | 50 | — |
| Approved | 0 | — |
| Refinement | 0 | — |
| Ready for Dev | 10 | — |
| Doing | 1 | — |
| Dev Review | 2 | — |
| Dev Box | 25 (1 lembrete local) | desenvolvimento concluído |
| In Test | 45 | **entregue** |
| Rework | 0 | não |
| Verified | 4 | **entregue** |
| Accepted | 0 | **entregue** |
| Done | 82 | **entregue** |

Escopo das métricas: **218 cards** (sem o lembrete local). O endpoint
`GET /api/projects/metrics` mostra 220 porque inclui 1 lembrete local e 1 card
arquivado fora de `Done` (não exibido no board); `GET /api/projects/1/metrics/dimensions`
mostra 218.

### Resumo do projeto

| Indicador | Antes (só `Done`) | Depois (entregue) |
|---|---:|---:|
| Cards no escopo | 218 | 218 |
| Cards finalizados | 82 | **131** |
| % Finalizado | 38% | **60%** |
| Desenvolvimento concluído (`developed`) | 155 (71%) | 155 (71%) |

No endpoint `GET /api/projects/metrics` (que inclui 1 lembrete local e 1 card
arquivado fora de `Done`):

| Campo | Valor |
|---|---|
| `summary.totalTasks` (workspace `gav`) | 330 |
| `summary.doneTasks` (formal) | 152 |
| `summary.deliveredTasks` | 233 |
| `summary.deliveredPct` | 71% |
| `perProject[MIG].totalTasks` | 220 |
| `perProject[MIG].doneTasks` (formal, preservado) | 82 |
| `perProject[MIG].deliveredTasks` (regra nova) | **131** |
| `perProject[MIG]` entregue calculado (131/220) | **60%** |

### Por módulo (dimensões do MIG)

| Módulo | Total | `Done` formal | Entregue | % antes | % depois |
|---|---:|---:|---:|---:|---:|
| cashier | 34 | 4 | 5 | 12% | 15% |
| config | 26 | 4 | 25 | 15% | **96%** |
| financeiro | 20 | 0 | 0 | 0% | 0% |
| troca | 20 | 1 | 1 | 5% | 5% |
| cliente | 16 | 4 | 14 | 25% | **88%** |
| auth | 13 | 6 | 13 | 46% | **100%** |
| venda | 11 | 1 | 1 | 9% | 9% |
| acordo, batch, estatisticas, monitor, nfce, voucher | 1 cada | 1 cada | 1 cada | 100% | 100% |

A soma dos módulos (146) não fecha com os 218 cards por dois motivos: 79
cards não têm label de módulo e 7 cards aparecem em mais de um módulo (146
atribuições para 139 cards com módulo). É a mesma semântica de
`aggregate_dimensions`.

### Por responsável (MIG)

`GET /api/projects/1/members` considera somente cards não arquivados. Como o
auto-arquivo move os cards de `Done` depois de 3 dias, a leitura "só Done"
fica zerada para quem já teve os cards arquivados — é justamente o caso em que
a regra de entregue devolve um número útil.

| Responsável | Total | `Done` formal (não arquivados) | Entregue | % antes | % depois |
|---|---:|---:|---:|---:|---:|
| Walter Pereira da Silva Lira | 32 | 0 | 30 | 0% | **94%** |
| Moises de Oliveira Santos Junior | 29 | 0 | 12 | 0% | **41%** |
| Jeferson de Oliveira Guimarães | 19 | 0 | 6 | 0% | **32%** |
| **Total atribuído** | **80** | **0** | **48** | **0%** | **60%** |

O MIG não tem goals cadastrados (`GET /api/projects/1/goals` → `[]`), então a
paridade de goals foi validada pelo teste automatizado, não por número real.

## O que continua usando somente `Done`

Estes caminhos são de **fluxo**, não de progresso/entrega, e foram mantidos:

| Caminho | Por quê |
|---|---|
| Lead time, cycle time, throughput 7d/30d e buckets semanais (`/api/projects/metrics`, `/api/metrics/detail`, `metrics_view`) | medem quando o card concluiu de fato |
| Auto-arquivo (`POST /api/projects/{id}/board` e `POST /api/tasks/{code}/archive`) e `done_at` | o marco de conclusão formal é que dispara o arquivamento |
| Sprint: `progress`, `doneCount`, fechamento (`/sprints/{id}/complete`) e retrospectiva | sprint fecha com `Done`, não com "em teste" |
| Changelog (`GET /api/projects/{id}/changelog`) — `completedInPeriod` | histórico do que concluiu no período |
| Relatório diário e digest/standup (`Concluídas hoje`, `_digest_context`) | eventos de conclusão do dia |
| Estágios (`/api/projects/{id}/metrics/stages`) e `isDone` de coluna | o estágio `Done` é um marco do fluxo |
| Vencidas / cards parados (`coach`, dashboard, PDF) | usam o corte de **dev** (`Dev Box`), não o de entrega |
| Board: cards arquivados em `Done` continuam aparecendo na coluna | preserva o contador histórico do Done |

Nos endpoints onde a leitura formal também é útil, ela foi preservada:
`/api/projects/metrics` continua devolvendo `doneTasks` e ganhou
`deliveredTasks`/`deliveredPct`; `/api/metrics/detail` mantém `last7d`,
`last30d`, `avgLeadHours` e `weeklyThroughput` no `Done` formal e passou a
usar entregue no `summary.done` e nos cortes por tipo/prioridade/projeto.

## Onde a regra faltava (corrigido nesta auditoria)

| Arquivo | O que usava `is_done`/`done_ids` | Correção |
|---|---|---|
| `relay/team_report.py` | `doneTotal`, `resumo.done` e `resumo.pct` do report semanal | passaram a usar `delivered_ids`; "em aberto" virou o complemento de entregue e `doneInWeek` (via `done_at`) continua formal |
| `relay/meeting_context.py` | "concluídos", `%` e "em aberto" do contexto de reunião | passaram a usar `delivered_ids`; "concluídos nos últimos 7 dias" continua via `done_at` |
| `relay/api/ext_insights.py` | `/metrics/detail` (`done`, por tipo/prioridade/projeto) e `/dashboard/projects` (barra de progresso) | passaram a usar entregue; `/dashboard/summary.done7d` continua formal |
| `relay/gui/views/metrics_view.py` | "concluídas", por tipo, por prioridade e por projeto | passaram a usar entregue; lead/throughput/7d/30d continuam formais |
| `relay/gui/views/dashboard_view.py` | barra de progresso dos projetos | passou a usar entregue; `Concluídas 7d` continua formal |
| `relay/gui/views/projects_view.py` | progresso do card de projeto | passou a usar entregue |
| `relay/gui/views/goals_view.py` e `relay/gui/views/board_view.py` | `_progresso`/`_goal_progress` de goals e pizza "Por épico" | passaram a usar entregue |
| `relay/api/ext_misc.py` | `GET /api/goals/{id}/progress` | passou a usar entregue (parity com `app._goal_progress`) |
| `relay/ai/tools.py` | `get_project_metrics` (ferramenta do agente) | passou a reportar entregues |
| `webui/src/pages/Dashboard.jsx` | card "Concluídas" lia `doneTasks` | passou a ler `deliveredTasks` (fallback `doneTasks`) |

Novo helper em `relay/dimensions.py`: `delivered_ids_by_project(columns)`,
usado pelas telas que agregam vários projetos (webui/API/GUI).

## Testes

`local-client/tests/test_entregue_consistencia.py` monta um board completo pela
API (`To do`, `Dev Box`, `In Test`, `Verified`, `Accepted`, `Rework`, `Done`),
com um card em cada coluna, e confere ponta a ponta:

- `/api/projects/{id}/metrics/dimensions` — `done` = 4 entregues,
  `developed` = 6 (Dev Box em diante), `Rework` fora do `done`;
- `/api/projects/metrics` — `doneTasks` = 1 (formal), `deliveredTasks` = 4,
  `deliveredPct` = 57%;
- `/api/projects/{id}/goals` e `/api/goals/{id}/progress` — `done` = 4;
- `/api/projects/{id}/members` — `done` = 4, `developed` = 6;
- `/api/projects/{id}/team/weekly` — progresso `4/7 (57%)`, "em aberto" = 3,
  enquanto `doneInWeek` (fluxo via `done_at`) continua separado;
- um card extra em `Rework` não muda o entregue (4), mas sobe o total e o
  `developed`.

Comando executado:

```bash
cd local-client
QT_QPA_PLATFORM=offscreen \
PYTHONPATH="$PWD:$PWD/.venv/lib/python3.14/site-packages" \
/usr/bin/python3 -m pytest \
  tests/test_entregue_consistencia.py tests/test_dimensions.py \
  tests/test_metrics_pdf.py tests/test_membros.py -q
```

Resultado: **53 passed**.
