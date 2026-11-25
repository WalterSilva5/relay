import { useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import {
  getProjectDaily,
  createProjectDaily,
  updateProjectDaily,
  deleteProjectDaily,
  getProjectDailySummary,
  exportProjectDaily,
  importProjectDaily,
} from '../api'
import { t } from '../i18n'
import Icon from './Icon.jsx'
import {
  Badge, Button, Card, EmptyState, Input, SearchInput, SectionTitle, Select, Textarea, Toolbar,
} from '../ui'

const KINDS = [
  ['WORK', 'Trabalho'],
  ['BLOCKER', 'Bloqueio'],
  ['DECISION', 'Decisão'],
  ['NOTE', 'Nota'],
]
const KIND_LABEL = Object.fromEntries(KINDS.map(([k, l]) => [k, l]))
const KIND_VARIANT = { WORK: 'success', BLOCKER: 'danger', DECISION: 'accent', NOTE: 'neutral' }
const KIND_BORDER = {
  WORK: 'border-success',
  BLOCKER: 'border-danger',
  DECISION: 'border-accent',
  NOTE: 'border-border-strong',
}

function todayISO() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function ProjectDaily({ projectId, author }) {
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  // formulário
  const [body, setBody] = useState('')
  const [kind, setKind] = useState('WORK')
  const [date, setDate] = useState(todayISO())
  const [minutes, setMinutes] = useState('')
  const [taskCode, setTaskCode] = useState('')

  // filtros
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterKind, setFilterKind] = useState('')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState(null)

  const kindOptions = KINDS.map(([value, label]) => ({ value, label: t(label) }))

  const load = () => {
    const params = {}
    if (filterFrom) params.dateFrom = filterFrom
    if (filterTo) params.dateTo = filterTo
    if (filterKind) params.kind = filterKind
    if (filterAuthor.trim()) params.author = filterAuthor.trim()
    if (search.trim()) params.q = search.trim()
    getProjectDaily(projectId, params).then(setEntries).catch((e) => setError(String(e.message || e)))
    getProjectDailySummary(projectId, {
      ...(filterFrom ? { dateFrom: filterFrom } : {}),
      ...(filterTo ? { dateTo: filterTo } : {}),
    }).then(setSummary).catch(() => setSummary(null))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [projectId, filterFrom, filterTo, filterKind, filterAuthor, search])

  const submit = async () => {
    if (!body.trim()) return
    try {
      await createProjectDaily(projectId, {
        body: body.trim(),
        date,
        kind,
        author: author || null,
        minutes: minutes ? Number(minutes) : null,
        taskCode: taskCode.trim() || null,
      })
      setBody('')
      setMinutes('')
      setTaskCode('')
      setError('')
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    try {
      await updateProjectDaily(editing.id, {
        body: editing.body,
        date: editing.date,
        kind: editing.kind,
        minutes: editing.minutes === '' || editing.minutes == null ? null : Number(editing.minutes),
        taskCode: editing.taskCode || '',
      })
      setEditing(null)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const remove = async (entry) => {
    const r = await Swal.fire({
      title: t('Excluir este registro?'),
      text: `${entry.date} · ${KIND_LABEL[entry.kind] || entry.kind}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Excluir'),
      cancelButtonText: t('Cancelar'),
    })
    if (!r.isConfirmed) return
    try {
      await deleteProjectDaily(entry.id)
      load()
    } catch (e) {
      setError(String(e.message || e))
    }
  }

  const exportDay = async () => {
    try {
      const data = await exportProjectDaily(projectId, date)
      const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      const msg = e.response?.data?.detail || String(e.message || e)
      Swal.fire({ icon: 'info', title: t('Nada para exportar'), text: msg })
    }
  }

  const importDay = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,text/markdown,text/plain'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const content = await file.text()
      const conf = await Swal.fire({
        title: t('Importar daily'),
        html: `<p>${t('Importar')} <b>${file.name}</b>?</p><p>${t('Os registros do dia serão substituídos.')}</p>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: t('Importar'),
        cancelButtonText: t('Cancelar'),
      })
      if (!conf.isConfirmed) return
      try {
        const r = await importProjectDaily(projectId, { content, replace: true })
        Swal.fire({ icon: 'success', title: t('Importado'), text: `${r.date} · ${r.created} ${t('bloco(s)')}`, timer: 1800, showConfirmButton: false })
        load()
      } catch (e) {
        Swal.fire({ icon: 'error', title: t('Erro'), text: e.response?.data?.detail || String(e.message || e) })
      }
    }
    input.click()
  }

  // agrupa por dia
  const grouped = useMemo(() => {
    const map = new Map()
    for (const e of entries) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date).push(e)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [entries])

  const hasFilters = !!(filterFrom || filterTo || filterKind || filterAuthor.trim() || search.trim())

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {summary && (
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-4">
            <SectionTitle>{t('Resumo')}</SectionTitle>
            <span className="text-sm">
              <b>{summary.total}</b> {t('registro(s) em')} <b>{summary.days.length}</b> {t('dia(s)')}
            </span>
            {summary.totalMinutes > 0 && (
              <span className="text-sm">
                <b>{Math.round(summary.totalMinutes / 60 * 10) / 10}h</b> {t('registradas')}
              </span>
            )}
            {KINDS.filter(([k]) => summary.byKind?.[k] > 0).map(([k, label]) => (
              <Badge key={k} variant={KIND_VARIANT[k] || 'neutral'}>
                {label}: {summary.byKind[k]}
              </Badge>
            ))}
            {summary.days.slice(0, 6).map((d) => (
              <span key={d.date} className="text-xs text-fg-muted">
                {d.date}: {d.entries}
              </span>
            ))}
            <span className="ml-auto flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" onClick={exportDay} title={t('Exportar o dia em markdown (formato do vault)')}>
                ⬇ {t('Exportar .md')}
              </Button>
              <Button variant="secondary" size="sm" onClick={importDay} title={t('Importar um doc de daily (.md)')}>
                ⬆ {t('Importar .md')}
              </Button>
            </span>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-md font-semibold">{t('Novo registro do dia')}</h3>

        <Textarea
          className="mt-3"
          rows={3}
          aria-label={t('Novo registro do dia')}
          placeholder={t('O que você fez hoje neste projeto...')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
          }}
        />

        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Input
            type="date"
            aria-label={t('Data')}
            title={t('Data')}
            className="w-40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Select
            value={kind}
            onValueChange={setKind}
            options={kindOptions}
            className="w-36"
            ariaLabel={t('Tipo')}
          />
          <Input
            type="number"
            min="0"
            placeholder={t('min')}
            aria-label={t('min')}
            className="w-24"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <Input
            placeholder={t('Card (opcional)')}
            aria-label={t('Card (opcional)')}
            className="w-40"
            value={taskCode}
            onChange={(e) => setTaskCode(e.target.value)}
          />
          <Button onClick={submit} disabled={!body.trim()}>{t('Registrar')}</Button>
          <span className="text-xs text-fg-muted">{t('Ctrl+Enter para salvar')}</span>
        </div>
      </Card>

      <Toolbar
        actions={(
          <>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setFilterFrom(''); setFilterTo(''); setFilterKind(''); setFilterAuthor('') }}
              >
                {t('Limpar')}
              </Button>
            )}
            <span className="text-xs text-fg-muted">{entries.length} {t('registro(s)')}</span>
          </>
        )}
      >
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Buscar no texto...')}
          aria-label={t('Buscar no texto...')}
          className="min-w-48 flex-1"
        />
        <span className="text-xs font-semibold text-fg-muted">{t('De')}</span>
        <Input
          type="date"
          size="sm"
          aria-label={t('De')}
          className="w-40"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
        />
        <span className="text-xs font-semibold text-fg-muted">{t('Até')}</span>
        <Input
          type="date"
          size="sm"
          aria-label={t('Até')}
          className="w-40"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
        />
        <Select
          size="sm"
          value={filterKind || '__all__'}
          onValueChange={(v) => setFilterKind(v === '__all__' ? '' : v)}
          options={[{ value: '__all__', label: t('Todos os tipos') }, ...kindOptions]}
          className="w-40"
          ariaLabel={t('Tipo')}
        />
        <Input
          placeholder={t('Autor')}
          aria-label={t('Autor')}
          size="sm"
          className="w-32"
          value={filterAuthor}
          onChange={(e) => setFilterAuthor(e.target.value)}
        />
      </Toolbar>

      {grouped.length === 0 && (
        <EmptyState
          icon={<Icon name="clipboard" size={20} />}
          title={hasFilters ? t('Nenhum registro para esses filtros.') : t('Nenhum registro ainda. Escreva o primeiro acima.')}
        />
      )}

      {grouped.map(([day, items]) => (
        <Card key={day} padding="sm">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-mono text-sm">{day}</strong>
            <span className="text-xs text-fg-muted">{items.length} {t('registro(s)')}</span>
          </div>

          <div className="mt-2 space-y-2">
            {items.map((entry) => (
              <div key={entry.id} className={`flex flex-col gap-1 border-l-2 pl-2.5 ${KIND_BORDER[entry.kind] || 'border-border-strong'}`}>
                {editing && editing.id === entry.id ? (
                  <>
                    <Textarea
                      rows={3}
                      aria-label={t('Editar registro')}
                      value={editing.body}
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                    />
                    <div className="flex flex-wrap items-end gap-1.5">
                      <Input
                        type="date"
                        size="sm"
                        aria-label={t('Data')}
                        className="w-40"
                        value={editing.date}
                        onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                      />
                      <Select
                        size="sm"
                        value={editing.kind}
                        onValueChange={(v) => setEditing({ ...editing, kind: v })}
                        options={kindOptions}
                        className="w-36"
                        ariaLabel={t('Tipo')}
                      />
                      <Input
                        type="number"
                        min="0"
                        placeholder={t('min')}
                        aria-label={t('min')}
                        size="sm"
                        className="w-24"
                        value={editing.minutes ?? ''}
                        onChange={(e) => setEditing({ ...editing, minutes: e.target.value })}
                      />
                      <Input
                        placeholder={t('Card (opcional)')}
                        aria-label={t('Card (opcional)')}
                        size="sm"
                        className="w-36"
                        value={editing.taskCode || ''}
                        onChange={(e) => setEditing({ ...editing, taskCode: e.target.value })}
                      />
                      <Button size="sm" onClick={saveEdit}>{t('Salvar')}</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>{t('Cancelar')}</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={KIND_VARIANT[entry.kind] || 'neutral'}>
                        {t(KIND_LABEL[entry.kind] || entry.kind)}
                      </Badge>
                      {entry.author && <span className="text-xs text-fg-muted">{entry.author}</span>}
                      {entry.minutes ? <span className="text-xs text-fg-muted">{entry.minutes} {t('min')}</span> : null}
                      {entry.taskCode && <Badge variant="outline" size="sm">{entry.taskCode}</Badge>}
                      <span className="ml-auto text-xs text-fg-muted">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString() : ''}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => setEditing({ ...entry })}>{t('Editar')}</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        className="text-danger"
                        aria-label={`${t('Excluir')} ${entry.date}`}
                        title={t('Excluir')}
                        onClick={() => remove(entry)}
                      >
                        <Icon name="close" size={14} />
                      </Button>
                    </div>
                    <div className="whitespace-pre-wrap text-sm text-fg">{entry.body}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
