# Plano de ação — reconstrução da UI (Relay web/Electron)

Data: 25/11/2026 · Status: **executado em 25/11/2026** — resultado e desvios na seção 7.

## 1. Diagnóstico (medido, não estimado)

| Sintoma | Número |
|---|---|
| Páginas | 26 arquivos · 8.022 linhas |
| Estilos inline (`style={{…}}`) | **928** (Board sozinho: 291) |
| Raios de borda distintos | **12** (2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 20 px) |
| Tamanhos de fonte distintos | **10** (9, 10, 11, 12, 13, 15, 16, 22, 24, 26 px) |
| Cores hex escritas à mão | **44** |
| Paddings ad hoc | dezenas (`2px 8px`, `1px 6px`, `8px 10px`, `10px 12px`…) |

**Causa raiz:** cada página decide sozinha dimensão, borda, cor e espaçamento. Não
existe camada de componentes — o "design system v2" anterior só trocou variáveis
globais; as 26 páginas continuaram com valores soltos. Enquanto houver `style={{}}`
com px/cor, a UI volta a parecer antiga a cada página nova.

**Conclusão:** não é refatoração incremental. É reconstruir em 3 camadas —
fundação (tokens) → primitivos (componentes) → páginas migradas uma a uma,
proibindo valores soltos por lint.

---

## 2. Decisões de arquitetura (precisam de OK antes de começar)

**D1 — Stack de estilo: Tailwind CSS v4 + Radix Primitives.**
Dimensão, borda e cor passam a ser *classes* que só existem na escala do token.
Radix resolve foco/teclado/portal (select, dialog, tooltip, tabs) sem reinventar.
*Alternativa:* CSS Modules + primitivos próprios (zero dependência nova, porém
mais código e mais fácil divergir). **Recomendo Tailwind + Radix.**

**D2 — Componentes próprios por cima do Radix** (não usar kit pronto tipo shadcn
copiado): `Button`, `Input`, `Select`, `Dialog`, `Tabs`, `Table`, `Card`,
`Badge`, `Tooltip`, `Toast`, `EmptyState`, `PageHeader`, `StatCard`, `Progress`,
`Field`, `Toolbar`, `DataTable`, `Avatar`, `Skeleton`, `SegmentedControl`.

**D3 — Escalas fechadas** (nada fora delas):
- espaço: 0,1,2,3,4,6,8,12,16,20,24,32,40,48,64 (px)
- raio: `sm 6` · `md 10` · `lg 14` · `xl 20` · `full`
- fonte: `xs 11` · `sm 12` · `base 13` · `md 14` · `lg 16` · `xl 20` · `2xl 26`
- altura de controle: `sm 28` · `md 34` · `lg 40`
- borda: 1px `border` · 1px `border-strong` · 2px foco
- sombra: `xs`, `sm`, `md`, `lg` (4 níveis, nada fora)
- cores: 1 marca + 4 semânticas × (fundo/texto/borda/hover) — 0 hex em página

**D4 — Layout:** grid de 8px, container com `max-width: 1440px`, gutters
`24/32/40` por breakpoint, sidebar 264/244/228 (rail 64), topbar fixa 56px.

**D5 — Regra dura:** página não escreve `px`, `#hex`, `borderRadius`, `fontSize`.
Só usa componente + classe utilitária da escala. Exceções: largura/altura
dinâmicas (progresso, gráfico) via `style` só com `width/height/transform`.

---

## 3. Fases e tarefas

### F0 — Fundação (2 dias)
- [ ] **F0.1** Instalar/configurar Tailwind v4 + Radix + `class-variance-authority` (ou variantes próprias) + `clsx`.
- [ ] **F0.2** `tailwind.config`: cores semânticas (bg, surface, elevated, border, border-strong, text, text-muted, accent, accent-hover, accent-soft, success, warning, danger) nos temas claro/escuro.
- [ ] **F0.3** Escalas de espaço/raio/fonte/sombra/altura como *tokens únicos* (D3).
- [ ] **F0.4** `globals.css`: reset, tipografia base, foco visível padrão (`ring-2 ring-accent/40`), scrollbar, `prefers-reduced-motion`.
- [ ] **F0.5** Remover `styles.css` legado (depois que as páginas migrarem — marcar como deprecado agora).
- **Aceite:** página de exemplo com 5 controles, 2 cards e tabela renderizando 100% por classes; 0 hex/px no arquivo.

### F1 — Primitivos (4 dias)
Para cada componente: variantes × tamanhos × estados (hover/active/focus/disabled/loading) + story local (página `/design`).
- [ ] **F1.1** `Button` (primary, secondary, ghost, danger, link; sm/md/lg; loading, icon-only)
- [ ] **F1.2** `Input`, `Textarea`, `Field` (label, hint, error, contador), `Checkbox`, `Switch`, `Radio`
- [ ] **F1.3** `Select` (Radix: teclado, portal, busca) + `Combobox` para listas grandes
- [ ] **F1.4** `Card`, `Panel`, `SectionTitle`, `Divider`, `EmptyState`, `Skeleton`
- [ ] **F1.5** `Badge`/`Chip` (neutral, accent, success, warning, danger, outline)
- [ ] **F1.6** `Tabs` e `SegmentedControl`
- [ ] **F1.7** `Dialog`/`Sheet`/`ConfirmDialog` (substitui SweetAlert nas ações destrutivas)
- [ ] **F1.8** `Toast` (sucesso/erro) — substitui `setMsg`/`setErro` espalhados
- [ ] **F1.9** `Tooltip`, `Avatar`, `Progress`
- [ ] **F1.10** `DataTable` (header sticky, densidade sm/md, ordenação, seleção, coluna responsiva que colapsa em card no mobile)
- [ ] **F1.11** `StatCard` (KPI: valor, rótulo, delta/chip, ícone)
- [ ] **F1.12** `PageHeader` (título, subtítulo, ações, breadcrumb) e `Toolbar` (busca/filtros/ação primária)
- **Aceite:** `/design` mostra todos os componentes em todos os estados; nada abaixo de 32px de alvo de toque; contraste AA verificado.

### F2 — Shell (2 dias)
- [ ] **F2.1** `AppShell`: sidebar + topbar + conteúdo com container/gutters por breakpoint.
- [ ] **F2.2** Sidebar: grupos, rail colapsada (ícones 40px), tooltip na rail, persistência, drawer no mobile com focus-trap.
- [ ] **F2.3** Topbar: busca global (Cmd/Ctrl+K abre `CommandPalette`), workspace/projeto, ações rápidas, avatar.
- [ ] **F2.4** `CommandPalette` (busca em páginas, projetos, cards, reuniões).
- [ ] **F2.5** Estados globais: loading (skeleton), erro (banner do design), vazio (EmptyState com ação).
- **Aceite:** navegação completa por teclado; shell idêntico em 1440/1024/768/420.

### F3 — Migração por ondas (10–12 dias)

Regra por página: **zero `style={{}}` com px/cor**, só primitivos. Cada onda
entrega build verde + screenshots 4 larguras + checklist.

**Onda 1 — Núcleo (3 d):** Dashboard, Board (kanban + filtros + card + drawer da tarefa), Métricas.
- [ ] **F3.1** Dashboard (StatCards, atividade, projetos)
- [ ] **F3.2** Board: colunas (header sticky, WIP, contagem), card (título/labels/avatar/data/selects compactos), toolbar de filtros, drawer de detalhe
- [ ] **F3.3** Métricas: KPIs, gráficos com legenda, tabelas por módulo/pessoa

**Onda 2 — Registro (3 d):** Reuniões, Reviews, Reviews de PR.
- [ ] **F3.4** Reuniões: lista (DataTable), detalhe com tabs, transcrição/analisar, player de áudio
- [ ] **F3.5** Reviews (semanal) e Reviews de PR: formulários em `Field`, tabelas de fatos/achados com linha editável, preview, histórico

**Onda 3 — Trabalho (3 d):** Meu Dia, TODOs, Time, Goals, Sprint Planning, Projetos.
- [ ] **F3.6..F3.11** cada página migrada

**Onda 4 — Suporte (2 d):** Estudos, Base (KB), Memória, Biblioteca, Ferramentas, TechLinks, Skills, Guia, Inglês, Tradução, API Tester, Configurações, Labels.
- [ ] **F3.12..F3.24** cada página migrada

**Onda 5 — Limpeza (1 d):** remover CSS legado, componentes órfãos, `styles.css`, classes mortas.

### F4 — Qualidade e guardrails (2 dias, contínuo)
- [ ] **F4.1** ESLint: `react/forbid-dom-props` para `style` (allowlist width/height/transform) + regra contra hex em JSX.
- [ ] **F4.2** Script `npm run ui:audit`: falha se `style={{` > 0 nas páginas, hex solto, raio/fonte fora da escala.
- [ ] **F4.3** Visual regression: snapshots 1440/1024/768/420 por página (Playwright) no CI local.
- [ ] **F4.4** A11y: axe nas 6 páginas principais; foco visível; contraste AA; labels em todos os campos.
- [ ] **F4.5** Checklist de PR: usa primitivo? zero px/cor? estados vazio/erro/loading? teclado ok?

### F5 — Rollout
- [ ] **F5.1** Migrar em branch `ui/rebuild` (ondas em commits separados), PR por onda.
- [ ] **F5.2** Build + suíte + screenshots comparativos (antes/depois) por onda.
- [ ] **F5.3** Publicar prints oficiais (`docs/prints/`) ao fim de cada onda.
- [ ] **F5.4** Remover dependência do SweetAlert nas páginas migradas (Dialog/Confirm próprios).

---

## 4. Ordem recomendada e esforço

| Fase | Entrega | Dias |
|---|---|---|
| F0 | Tokens + Tailwind/Radix | 2 |
| F1 | 12 famílias de primitivos + `/design` | 4 |
| F2 | Shell + busca global | 2 |
| F3 | 26 páginas em 5 ondas | 10–12 |
| F4 | Lint + auditoria + visual regression | 2 |
| **Total** | | **20–22 dias-dev** |

**Caminho crítico:** F0 → F1 → F2 → Onda 1. Nada de página antes dos primitivos.

---

## 5. Critérios de aceite (globais)

1. `grep -c "style={{"` nas páginas = **0** (exceto width/height/transform dinâmicos, com comentário).
2. Nenhum `#hex`, `px`, `borderRadius` ou `fontSize` em `pages/**`.
3. Todas as páginas nos 4 breakpoints sem overflow horizontal.
4. Foco visível e navegação por teclado em todo controle; contraste AA.
5. `/design` é a fonte da verdade visual e está sempre atualizada.
6. CI local falha se 1–3 forem violados.

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Migração longa e "meio termo" (metade nova, metade velha) | Ondas fechadas; página só entra quando migra 100%; feature freeze de UI durante a obra |
| Tailwind virar "sopa de classes" | Só classes do token; variantes encapsuladas no primitivo; página não estiliza |
| Regressão de comportamento | Suíte (590 testes) + screenshots por onda + checklist |
| Tempo maior que o previsto | Onda 1 entrega valor visível em 3 dias; resto pode pausar sem quebrar |

---

## 7. Execução (25/11/2026)

### Entregue

- **Fundação:** Tailwind CSS v4 + Radix + `clsx`/CVA; `src/styles/theme.css` com
  escala fechada de cor, fonte, raio, sombra e altura de controle; tema claro/escuro.
- **Primitivos:** 26 componentes em `src/ui` (Button, Card, Badge, EmptyState,
  Skeleton, Progress, Avatar, Tooltip, Spinner, Field, Input, Textarea, Checkbox,
  Switch, RadioGroup, Select, SearchInput, PageHeader, Toolbar, StatCard,
  DataTable, Tabs, SegmentedControl, Dialog, ConfirmDialog, Toast).
- **Catálogo vivo:** rota `/design` com todos os componentes, variantes e estados.
- **Shell:** `AppShell` com sidebar (rail persistida, grupos, gaveta mobile),
  topbar de 56px, `CommandPalette` (⌘/Ctrl+K) e container responsivo.
- **Páginas:** 27 rotas migradas (todas as 26 originais + `/design`);
  `TaskDetail` e `ProjectDaily` também migrados.
- **Limpeza:** `src/styles.css` removido; nenhuma página usa classe legada,
  `style` com px/cor, hex ou `NNpx`.
- **Guardrail:** `npm run ui:audit` (falha se página migrada voltar a usar valor
  solto); `scripts/ui-shot.py` para capturas/checagem de overflow em CDP.
- **Prints oficiais:** `docs/prints/{dashboard,board,metricas,reunioes,reviews-pr}.png`
  recapturados em 1440×900.

### Evidências

- `npm run build`: verde.
- `npm run ui:audit`: `ui:audit ok — nenhuma página usa valores soltos`.
- `pytest -q`: **590 passed**, 1 falha pré-existente
  (`test_daily_doc.py::test_round_trip_arquivo_real_do_vault`).
- `scripts/ui-shot.py`: 24 rotas × 420/768/1024/1440 **sem overflow horizontal**
  (`scrollWidth == clientWidth`); gaveta mobile e foco preso do diálogo conferidos.
- Teclado validado em navegador real no `/design`: `Esc` fecha o `Dialog`,
  setas/`Enter` navegam e selecionam no `Select` (Radix). O envio de teclas via
  CDP não chega na janela Electron oculta — por isso a validação foi feita no
  navegador, não no print.
- Tema escuro conferido no app empacotado; em janela oculta as transições CSS
  ficam paradas no primeiro frame (artefato do headless, não do app) — validar com
  `document.getAnimations().forEach(a => a.finish())` no CDP.

### Desvios conscientes do plano

| Item | O que foi feito | Por quê |
|---|---|---|
| F4.1 ESLint | `ui:audit` próprio em vez de `eslint-plugin-react` | evita mais uma dependência e já cobre o critério (style/hex/px) |
| F4.3 Playwright | `scripts/ui-shot.py` via CDP | ambiente sem Playwright/navegador baixado; script checa overflow e gera prints |
| F4.4 axe | verificação manual de foco/labels/contraste | `axe-core` não está instalado no ambiente |
| F5.1 branch `ui/rebuild` | commits em `main` | preferência do projeto: sem PR e sem branch intermediária |
| F5.4 SweetAlert | removido das páginas; permanece em `WorkspaceSelector`, `ProjectSelector` e `ProjectDaily` | são prompts de shell/importação; migração exige novo fluxo de formulário e fica para demanda própria |
| i18n | rótulos novos caem no fallback PT quando o idioma é EN | catálogo `i18n_catalog.js` não foi alterado nesta obra |

---

## 8. Ajustes pós-rebuild (26/11/2026)

Depois da entrega inicial, quatro ajustes fecharam a experiência do Electron:

- **Menu por uso:** “Trabalho” começa por **Board → Dashboard → Meu Dia → TODOs**;
  “Registro” fica com Reuniões/Reviews/Reviews de PR/Assistente; “Conhecimento”
  começa por Base/Memória/Biblioteca/Estudos. Cada item virou botão com borda
  (`border-strong`), fundo de superfície e hover/ativo em accent.
- **Paleta clara:** azul corporativo `#1d4ed8`, sidebar `#e8eef6`, fundo `#eef2f7`,
  bordas `#d3dce7`/`#b7c3d2` e texto subtle `#5f6b7d` (contraste AA; mínimo
  4,81:1). O tema escuro ganhou o equivalente azul-slate (`#60a5fa`).
- **Board mais leve:** colunas renderizam 20 cards e liberam o restante em
  “Mostrar mais”. Medição no pacote final: **104 cards / 212 selects / ~4 mil nós**
  na entrada (antes: 279/564/9,5 mil). O Electron também recupera renderer
  morto (`render-process-gone`, máx. 2 reloads/min) e oferece “Recarregar janela”
  na bandeja.
- **Fim da UI antiga em cache:** o Electron limpa cache HTTP +
  `serviceworkers/cachestorage` no boot; o PWA usa `relay-v2`. O AppImage e o
  `linux-unpacked` foram recompilados com o bundle `index-DTUqh1-N.js`.

Prints oficiais recapturados com esse estado em `docs/prints/` (dashboard, board,
métricas, reuniões e reviews de PR).
