# Guia de migração das páginas para o design system

Data: 25/11/2026 · Complementa `docs/ui-rebuild-plan.md` (fases F1/F3).

Este guia é o contrato para migrar uma página do CSS legado para os primitivos
em `local-client/webui/src/ui`. O objetivo é que a página **não escreva mais
dimensão, cor nem borda** — só componha primitivos e classes do tema.

## Regra de ouro

```jsx
// errado
<div style={{ padding: 12, borderRadius: 8, background: '#fff' }}>
  <button style={{ height: 32, fontSize: 12 }}>Salvar</button>
</div>

// certo
<Card>
  <Button size="sm">Salvar</Button>
</Card>
```

Proibido em `pages/**`:

- `style={{ … }}` com `px`, `#hex`, `borderRadius`, `fontSize`, `color`, `background`
  (só `width`/`height`/`transform`/`left`/`top` dinâmicos, ex.: barra de progresso).
- `#rrggbb` / `#rgb` solto.
- `NNpx` em qualquer propriedade.
- Classes do CSS legado (`card`, `row`, `muted`, `btn`, `ghost`, `danger`, `chip`,
  `preview`, `sectionLabel`, `hint`, `mono`, `pill`, `kpi`, `stat`…). Migrou, sumiu.

Exceções: gráficos SVG podem usar `width`/`height`/`viewBox` e `stroke`/`fill`
com `currentColor` ou `var(--color-…)`; nunca hex.

## Casca

A página é renderizada dentro de `AppShell` (sidebar + topbar + `.app-container`).
Portanto:

- **não** adicione padding/max-width/margem externa na raiz;
- comece por `<PageHeader … />` (título/descrição/ações);
- use `space-y-6` (ou `gap-6`) entre blocos;
- grids responsivos: `grid gap-3 sm:grid-cols-2 xl:grid-cols-4`, tabelas com
  `DataTable` (já tem scroll horizontal e esconde colunas no mobile).

## Primitivos (import único)

```jsx
import {
  Avatar, Badge, Button, Card, CardHeader, Chip, ConfirmDialog, DataTable,
  Dialog, Divider, EmptyState, Field, Input, PageHeader, Progress, RadioGroup,
  SearchInput, SectionTitle, SegmentedControl, Select, Skeleton, Spinner,
  StatCard, Switch, Tabs, Textarea, Toolbar, Tooltip, useToast,
} from '../ui'
import Icon from '../components/Icon.jsx'
```

### Ações e conteúdo

- `Button` — `variant`: `primary|secondary|ghost|danger|link`; `size`: `sm|md|lg`;
  `loading`, `disabled`, `iconOnly`, `as`. Props repassadas (`onClick`, `title`, `type`).
- `Card` — `padding: sm|md|lg|none`, `variant: default|flat`; `CardHeader`
  (`title`, `description`, `action`); `SectionTitle`; `Divider`.
- `Badge` — `variant: neutral|accent|success|warning|danger|outline`, `size: sm|md`;
  `Chip` (`dot` opcional).
- `EmptyState` — `icon`, `title`, `description`, `action`.
- `Skeleton` — `w`, `h`, `rounded` (classes); `Spinner` — `size: xs|sm|md|lg`.
- `Progress` — `value`, `max`, `tone: accent|success|warning|danger`, `size`.
- `Avatar` — `name`, `src`, `size: sm|md|lg`.
- `Tooltip` — `content`, `side`, `align`; envolve o gatilho.

### Layout e dados

- `PageHeader` — `title`, `description`, `actions`, `breadcrumb`.
- `Toolbar` — `children` (esquerda), `actions` (direita); quebra no mobile.
- `StatCard` — `label`, `value`, `icon` (nó React, ex.: `<Icon …/>`), `hint`,
  `tone: accent|success|warning|danger`, `delta: { value, tone }`.
- `DataTable` — `columns: [{ key, header, render(row), align, sortable,
  hideOnMobile, width }]`, `rows`, `rowKey(row)`, `onRowClick`, `empty`,
  `loading`, `dense`, `sort`, `onSortChange`. Já tem borda, header sticky e
  scroll; **não** envolva em `Card` com padding.
- `Tabs` — `tabs: [{ value, label, icon?, badge? }]`, `value`, `onValueChange`,
  `children` (ou `tab.content`).
- `SegmentedControl` — `options: [{ value, label }]`, `value`, `onChange`.
- `Dialog` — `open`, `onOpenChange`, `title`, `description`, `footer`, `size`.
- `ConfirmDialog` — `open`, `onOpenChange`, `title`, `description`,
  `confirmLabel`, `cancelLabel`, `tone: default|danger`, `onConfirm`, `loading`.
- `useToast()` — `toast({ title, description, tone })`. Requer `ToastProvider`
  (já montado em `App.jsx`).

### Formulário

- `Field` — `label`, `hint`, `error`, `required`, `counter`, `htmlFor`.
  Envolve o controle e liga label/erro por aria.
- `Input` — `invalid`, `leadingIcon`, `trailing`, `size`; `Textarea`.
- `Select` — `value`, `onValueChange`, `options: [{ value, label, disabled? }]`,
  `placeholder`, `size`, `invalid`, `disabled`, `ariaLabel`. Radix: teclado/portal.
- `SearchInput` — `value`, `onChange`, `placeholder` (recebe valor direto, não evento).
- `Checkbox` — `label`, `description`, `checked`, `onCheckedChange`.
- `Switch` — `label`, `checked`, `onCheckedChange`.
- `RadioGroup` — `options: [{ value, label, description? }]`, `value`, `onValueChange`.

## Escala permitida de classes

- espaço: `0 1 2 3 4 6 8 12 16 20 24 32 40 48 64` (Tailwind: p-1..p-16);
- raio: `rounded-sm|md|lg|xl|full`;
- fonte: `text-xs|sm|base|md|lg|xl|2xl|3xl`;
- altura de controle: `h-control-sm|control|control-lg`;
- sombra: `shadow-xs|sm|md|lg`;
- cor: `bg-bg|surface|surface-2|elevated|accent|accent-soft|accent-soft-2|success-soft|warning-soft|danger-soft`,
  `text-fg|fg-muted|fg-subtle|accent|accent-contrast|success|warning|danger`,
  `border-border|border-strong|accent|success|warning|danger`.
- Nada de `text-[13px]`, `p-[10px]`, `bg-[#…]`, `rounded-[6px]`.

## O que preservar (obrigatório)

1. **Comportamento**: todos os `useState`, `useEffect`, chamadas de API, handlers,
   polling, drag-and-drop, atalhos e navegação continuam idênticos.
2. **Textos e i18n**: mantenha `t('…')` e as strings existentes; não “melhore” copy.
3. **Contratos da API**: não altere endpoints, parâmetros nem formato de payload.
4. **Estados**: loading (Skeleton/Spinner), vazio (EmptyState), erro (texto
   `text-danger` ou toast) e sucesso continuam perceptíveis.
5. **Acessibilidade**: todo botão só de ícone tem `aria-label`; campos têm label.

## Validação antes de reportar

```bash
cd local-client/webui
npx esbuild src/pages/<Pagina>.jsx --loader:.jsx=jsx --outfile=/dev/null
UI_MIGRATED=<Pagina1>,<Pagina2> node scripts/ui-audit.mjs
```

O `ui:audit` deve sair **0 bloqueante(s)** para as páginas atribuídas. Avisos em
outras páginas não são seus. **Não** rode `npm run build`, `npm install` nem git —
o orquestrador fecha a onda.

## Proibições

- Não edite `src/ui/**`, `src/shell/**`, `src/App.jsx`, `src/styles.css`,
  `src/styles/theme.css`, `src/api.js`, `src/i18n*`, `package.json`.
- Não crie componentes novos em `src/ui/`; se faltar algo, resolva com o que
  existe e reporte a lacuna.
- Não remova funcionalidade para “ficar mais bonito”.

## Paleta clara atual (26/11/2026)

Os valores vivem em `src/styles/theme.css`; páginas continuam sem hex.

| Papel | Token | Valor |
|---|---|---|
| Marca | `--color-accent` | `#4f46e5` |
| Marca hover | `--color-accent-hover` | `#4338ca` |
| Marca suave | `--color-accent-soft` | `#e9eeff` |
| Fundo | `--color-bg` | `#f5f7fa` |
| Superfície | `--color-surface` | `#ffffff` |
| Sidebar | `--color-sidebar` | `#f1f4f9` |
| Coluna do board | `--color-column` | `#edf1f6` |
| Borda | `--color-border` | `#e2e6ed` |
| Borda forte | `--color-border-strong` | `#cdd3de` |
| Texto | `--color-fg` | `#111317` |
| Texto muted | `--color-fg-muted` | `#5b6373` |
| Texto subtle | `--color-fg-subtle` | `#697183` |
| Sucesso | `--color-success` | `#15803d` |
| Atenção | `--color-warning` | `#b45309` |
| Perigo | `--color-danger` | `#dc2626` |

O tema escuro é definido no bloco `:where([data-theme='dark'])` do mesmo arquivo.
Ao mudar a paleta, rode `npm run build`, `./electron/sync-webui.sh`, recapture os
prints e valide contraste (texto normal ≥ 4,5:1).
