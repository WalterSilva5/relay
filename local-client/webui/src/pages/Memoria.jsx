import { useEffect, useState } from 'react'
import {
  getMemoryEntries,
  getMemoryEntry,
  createMemoryEntry,
  updateMemoryEntry,
  deleteMemoryEntry,
  searchMemory,
  askMemory,
  getMemoryStats,
  apiError,
} from '../api'
import { t } from '../i18n'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
  Toolbar,
  useToast,
} from '../ui'
import Icon from '../components/Icon.jsx'

const KINDS = [
  ['fact', 'Fato'],
  ['decision', 'Decisão'],
  ['preference', 'Preferência'],
  ['episode', 'Episódio'],
  ['procedure', 'Procedimento'],
  ['context', 'Contexto'],
]

// Radix Select não aceita item com valor vazio: o "todos" usa um sentinela.
const TODOS = '__all__'

const EMPTY = { title: '', kind: 'fact', summary: '', tags: '', importance: 0.5, content: '' }

export default function Memoria() {
  const [entries, setEntries] = useState([])
  const [stats, setStats] = useState(null)
  const [q, setQ] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const toast = useToast()

  const load = async (kind = kindFilter, query = '') => {
    try {
      const params = {}
      if (kind) params.kind = kind
      if (query) params.q = query
      params.limit = 200
      const rows = await getMemoryEntries(params)
      setEntries(Array.isArray(rows) ? rows : rows.entries || [])
    } catch (e) {
      setStatus(apiError(e))
    }
  }

  useEffect(() => {
    load('', '')
    getMemoryStats().then(setStats).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openEntry = async (id) => {
    setStatus('')
    try {
      const e = await getMemoryEntry(id)
      setSel(e.id)
      setForm({
        title: e.title || '',
        kind: e.kind || 'fact',
        summary: e.summary || '',
        tags: Array.isArray(e.tags) ? e.tags.join(', ') : e.tags || '',
        importance: e.importance ?? 0.5,
        content: e.content || '',
      })
    } catch (e) {
      setStatus(apiError(e))
    }
  }

  const newEntry = () => {
    setSel(null)
    setForm(EMPTY)
    setAnswer('')
    setStatus('')
  }

  const save = async () => {
    if (!form.content.trim()) {
      setStatus(t('Conteúdo da memória...'))
      return
    }
    setBusy(true)
    setStatus('')
    try {
      const body = {
        title: form.title.trim() || form.content.trim().slice(0, 80),
        content: form.content,
        kind: form.kind,
        summary: form.summary,
        tags: form.tags,
        importance: Number(form.importance) || 0.5,
      }
      if (sel) await updateMemoryEntry(sel, body)
      else {
        const created = await createMemoryEntry(body)
        setSel(created.id)
      }
      load(kindFilter, '')
      getMemoryStats().then(setStats).catch(() => {})
      toast({ title: t('Salvo'), tone: 'success' })
    } catch (e) {
      setStatus(apiError(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!sel) return
    setBusy(true)
    try {
      await deleteMemoryEntry(sel)
      newEntry()
      load(kindFilter, '')
      getMemoryStats().then(setStats).catch(() => {})
      setConfirmar(false)
    } catch (e) {
      setStatus(apiError(e))
      setConfirmar(false)
    } finally {
      setBusy(false)
    }
  }

  const search = async () => {
    if (!q.trim()) {
      load(kindFilter, '')
      setAnswer('')
      return
    }
    setBusy(true)
    setAnswer('')
    try {
      const r = await searchMemory({ query: q.trim(), kind: kindFilter || undefined, topK: 12 })
      const hits = r.results || []
      setEntries(hits)
      setAnswer(hits.length ? `${t('Resultados')}: ${hits.length}` : t('Nenhuma memória relevante.'))
    } catch (e) {
      setStatus(apiError(e))
    } finally {
      setBusy(false)
    }
  }

  const ask = async () => {
    if (!q.trim()) return
    setBusy(true)
    setAnswer(t('Pensando...'))
    try {
      const r = await askMemory({ question: q.trim() })
      let txt = r.answer || ''
      if (r.sources?.length) txt += '\n\n' + t('Fontes') + ': ' + r.sources.map((s) => s.title).join(', ')
      setAnswer(txt)
    } catch (e) {
      setAnswer(apiError(e))
    } finally {
      setBusy(false)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Memória agentic')}
        description={t('Fatos, decisões e contexto do workspace com busca semântica para agentes e IA.')}
      />

      {stats && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">
            {t('Total')}: {stats.total}
          </Badge>
          <Badge>
            {t('Com embedding')}: {stats.withEmbedding}
          </Badge>
          {stats.byKind
            ? Object.entries(stats.byKind).map(([k, v]) => (
                <Badge key={k} variant="outline">
                  {k}={v}
                </Badge>
              ))
            : null}
        </div>
      )}

      <Toolbar
        actions={
          <>
            <Button onClick={search} disabled={busy}>
              {t('Buscar')}
            </Button>
            <Button variant="secondary" onClick={ask} disabled={busy}>
              {t('Perguntar à IA')}
            </Button>
          </>
        }
      >
        <SearchInput
          className="sm:w-80"
          aria-label={t('Buscar ou perguntar à memória...')}
          placeholder={t('Buscar ou perguntar à memória...')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
      </Toolbar>

      {answer && (
        <Card variant="flat" role="status" className="whitespace-pre-wrap text-sm text-fg">
          {answer}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 lg:col-span-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <Select
                ariaLabel={t('Todos os tipos')}
                value={kindFilter || TODOS}
                onValueChange={(value) => {
                  const kind = value === TODOS ? '' : value
                  setKindFilter(kind)
                  load(kind, '')
                }}
                options={[
                  { value: TODOS, label: t('Todos os tipos') },
                  ...KINDS.map(([value, label]) => ({ value, label: t(label) })),
                ]}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft"
                disabled={!sel || busy}
                onClick={() => setConfirmar(true)}
              >
                {t('Excluir selecionada')}
              </Button>
              <Button variant="secondary" size="sm" onClick={newEntry}>
                <Icon name="plus" size={14} /> {t('Nova')}
              </Button>
            </div>
          </div>

          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {entries.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openEntry(n.id)}
                aria-current={sel === n.id ? 'true' : undefined}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors ${
                  sel === n.id
                    ? 'border-accent bg-accent-soft text-fg'
                    : 'border-transparent text-fg hover:bg-surface-2'
                }`}
              >
                <Badge variant="outline">{n.kind}</Badge>
                <span className="min-w-0 flex-1 truncate">{n.title || t('(sem título)')}</span>
                {n.score != null && <span className="shrink-0 text-xs text-fg-subtle">{n.score}</span>}
              </button>
            ))}
            {entries.length === 0 && <EmptyState className="py-6" title={t('Nada aqui ainda.')} />}
          </div>

        </Card>

        <Card className="space-y-3 lg:col-span-2">
          <Field label={t('Título')}>
            <Input value={form.title} onChange={set('title')} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Tipo')}>
              <Select
                value={form.kind}
                onValueChange={(value) => setForm((f) => ({ ...f, kind: value }))}
                options={KINDS.map(([value, label]) => ({ value, label: t(label) }))}
              />
            </Field>

            <Field label={t('Importância')}>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={form.importance}
                onChange={set('importance')}
              />
            </Field>
          </div>

          <Field label={t('tags separadas por vírgula')}>
            <Input value={form.tags} onChange={set('tags')} />
          </Field>

          <Field label={t('Resumo curto (opcional)')}>
            <Input value={form.summary} onChange={set('summary')} />
          </Field>

          <Field label={t('Conteúdo da memória...')}>
            <Textarea rows={10} value={form.content} onChange={set('content')} />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={busy}>
              {t('Salvar')}
            </Button>
            {status && (
              <p role="alert" className="text-sm text-danger">
                {status}
              </p>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        title={t('Excluir esta memória?')}
        confirmLabel={t('Excluir')}
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  )
}
