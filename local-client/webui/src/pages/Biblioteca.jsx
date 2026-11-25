import { useEffect, useState } from 'react'
import {
  getSnippets,
  createSnippet,
  updateSnippet,
  useSnippet,
  deleteSnippet,
  getRunbooks,
  createRunbook,
  updateRunbook,
  useRunbook,
  deleteRunbook,
  scanTodos,
  importTodos,
  triageBug,
  codeReview,
  gitStatus,
  getTimeLogs,
  logTime,
  deleteTimeLog,
  getProjects,
} from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon'
import {
  Badge, Button, Card, CardHeader, Checkbox, DataTable, Field, Input,
  PageHeader, SearchInput, SectionTitle, Select, Tabs, Textarea, Toolbar, useToast,
} from '../ui'

const EMPTY_SNIPPET = { title: '', kind: 'SNIPPET', language: '', tags: '', content: '' }
const EMPTY_RUNBOOK = { title: '', category: '', command: '', description: '' }

const ALL_KIND = [
  { value: 'ALL', label: 'Todos' },
  { value: 'SNIPPET', label: 'Snippet' },
  { value: 'PROMPT', label: 'Prompt' },
]

function copy(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text || '')
}

function SnippetsTab() {
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [form, setForm] = useState(EMPTY_SNIPPET)
  const [editing, setEditing] = useState(null)
  const toast = useToast()

  const kindOptions = [
    { value: 'SNIPPET', label: t('Snippet') },
    { value: 'PROMPT', label: t('Prompt') },
  ]

  const load = () =>
    getSnippets({ ...(kind ? { kind } : {}), ...(q ? { q } : {}) }).then(setItems).catch(() => {})

  useEffect(() => {
    load()
  }, [q, kind])

  const save = async () => {
    if (!form.title.trim()) return
    if (editing) await updateSnippet(editing, form)
    else await createSnippet(form)
    setForm(EMPTY_SNIPPET)
    setEditing(null)
    load()
  }

  const startEdit = (s) => {
    setEditing(s.id)
    setForm({
      title: s.title || '',
      kind: s.kind || 'SNIPPET',
      language: s.language || '',
      tags: s.tags || '',
      content: s.content || '',
    })
  }

  const copyItem = (s) => {
    copy(s.content)
    useSnippet(s.id)
    toast({ title: t('Copiado!'), tone: 'success' })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={editing ? t('Editar') : t('Novo item')} />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label={t('Título')}>
            <Input
              placeholder={t('Título')}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label={t('Tipo')}>
            <Select
              value={form.kind}
              onValueChange={(v) => setForm({ ...form, kind: v })}
              options={kindOptions}
              ariaLabel={t('Tipo')}
            />
          </Field>
          <Field label={t('Linguagem')}>
            <Input
              placeholder={t('Linguagem (ex.: bash, python)')}
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            />
          </Field>
          <Field label={t('Tags')}>
            <Input
              placeholder={t('Tags separadas por vírgula')}
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </Field>
        </div>

        <Field label={t('Conteúdo')} className="mt-3">
          <Textarea
            rows={5}
            placeholder={t('Conteúdo...')}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </Field>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={save}>{editing ? t('Salvar') : t('+ Novo')}</Button>
          {editing && (
            <Button variant="ghost" onClick={() => { setEditing(null); setForm(EMPTY_SNIPPET) }}>
              {t('Cancelar')}
            </Button>
          )}
        </div>
      </Card>

      <Toolbar>
        <SearchInput
          className="w-full sm:w-64"
          placeholder={t('Buscar...')}
          aria-label={t('Buscar...')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          className="w-full sm:w-40"
          value={kind || 'ALL'}
          onValueChange={(v) => setKind(v === 'ALL' ? '' : v)}
          options={ALL_KIND.map((o) => ({ ...o, label: t(o.label) }))}
          ariaLabel={t('Tipo')}
        />
      </Toolbar>

      <DataTable
        columns={[
          {
            key: 'title',
            header: t('Título'),
            render: (s) => (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium text-fg">
                  <Icon name={s.kind === 'SNIPPET' ? 'clipboard' : 'chat'} size={13} />
                  <span className="truncate">{s.title}</span>
                </div>
                {(s.language || s.tags) && (
                  <div className="text-xs text-fg-muted">
                    {[s.language, s.tags].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'content',
            header: t('Conteúdo'),
            hideOnMobile: true,
            render: (s) => (
              <pre className="line-clamp-2 whitespace-pre-wrap break-words font-mono text-xs text-fg-muted">
                {s.content}
              </pre>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (s) => (
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Button variant="secondary" size="sm" onClick={() => copyItem(s)}>{t('Copiar')}</Button>
                <Button variant="ghost" size="sm" title={t('Editar')} onClick={() => startEdit(s)}>
                  {t('Editar')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('Excluir')}
                  title={t('Excluir')}
                  onClick={() => deleteSnippet(s.id).then(load)}
                >
                  <Icon name="close" size={13} />
                </Button>
              </div>
            ),
          },
        ]}
        rows={items}
        rowKey={(s) => s.id}
        empty={t('Nada aqui ainda.')}
      />
    </div>
  )
}

function RunbooksTab() {
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [form, setForm] = useState(EMPTY_RUNBOOK)
  const [editing, setEditing] = useState(null)
  const toast = useToast()

  const load = () => getRunbooks(q ? { q } : {}).then(setItems).catch(() => {})
  useEffect(() => {
    load()
  }, [q])

  const save = async () => {
    if (!form.title.trim()) return
    if (editing) await updateRunbook(editing, form)
    else await createRunbook(form)
    setForm(EMPTY_RUNBOOK)
    setEditing(null)
    load()
  }
  const startEdit = (r) => {
    setEditing(r.id)
    setForm({
      title: r.title || '',
      category: r.category || '',
      command: r.command || '',
      description: r.description || '',
    })
  }

  const copyCommand = (r) => {
    copy(r.command)
    useRunbook(r.id)
    toast({ title: t('Copiado!'), tone: 'success' })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={editing ? t('Editar') : t('Novo item')} />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label={t('Título')}>
            <Input
              placeholder={t('Título')}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label={t('Categoria')}>
            <Input
              placeholder={t('Categoria (ex.: setup, deploy)')}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </Field>
        </div>

        <Field label={t('Comando(s)')} className="mt-3">
          <Textarea
            rows={2}
            className="font-mono"
            placeholder={t('Comando(s)...')}
            value={form.command}
            onChange={(e) => setForm({ ...form, command: e.target.value })}
          />
        </Field>

        <Field label={t('Descrição (opcional)')} className="mt-3">
          <Textarea
            rows={2}
            placeholder={t('Descrição (opcional)')}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={save}>{editing ? t('Salvar') : t('+ Novo')}</Button>
          {editing && (
            <Button variant="ghost" onClick={() => { setEditing(null); setForm(EMPTY_RUNBOOK) }}>
              {t('Cancelar')}
            </Button>
          )}
        </div>
      </Card>

      <Toolbar>
        <SearchInput
          className="w-full sm:w-64"
          placeholder={t('Buscar...')}
          aria-label={t('Buscar...')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </Toolbar>

      <DataTable
        columns={[
          {
            key: 'title',
            header: t('Título'),
            render: (r) => (
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-fg">
                  <Icon name="settings" size={13} />
                  <span className="truncate">{r.title}</span>
                  {r.category && <span className="text-xs font-normal text-fg-muted">{r.category}</span>}
                </div>
                <code className="block break-all text-xs text-fg-muted">{r.command}</code>
                {r.description && <p className="text-xs text-fg-muted">{r.description}</p>}
              </div>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Button variant="secondary" size="sm" onClick={() => copyCommand(r)}>
                  {t('Copiar comando')}
                </Button>
                <Button variant="ghost" size="sm" title={t('Editar')} onClick={() => startEdit(r)}>
                  {t('Editar')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('Excluir')}
                  title={t('Excluir')}
                  onClick={() => deleteRunbook(r.id).then(load)}
                >
                  <Icon name="close" size={13} />
                </Button>
              </div>
            ),
          },
        ]}
        rows={items}
        rowKey={(r) => r.id}
        empty={t('Nada aqui ainda.')}
      />
    </div>
  )
}

function ImportTab() {
  const [path, setPath] = useState('')
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState({})
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    getProjects().then((ps) => {
      setProjects(ps)
      if (ps[0]) setProjectId(String(ps[0].id))
    }).catch(() => {})
  }, [])

  const scan = async () => {
    if (!path.trim() || scanning) return
    setScanning(true)
    setStatus(t('Varrendo...'))
    try {
      const r = await scanTodos({ path: path.trim() })
      setItems(r.items)
      const sel = {}
      r.items.forEach((_, i) => { sel[i] = true })
      setSelected(sel)
      setStatus(`${t('Encontrados')}: ${r.count}`)
    } catch (e) {
      setStatus(e.response?.data?.detail || String(e.message || e))
    } finally {
      setScanning(false)
    }
  }

  const doImport = async () => {
    if (!projectId) return setStatus(t('Selecione um projeto'))
    const chosen = items.filter((_, i) => selected[i])
    if (!chosen.length) return setStatus(t('Nada selecionado'))
    const r = await importTodos({ projectId: Number(projectId), items: chosen })
    setStatus(`${t('Tarefas criadas')}: ${r.created}`)
    setItems([])
    setSelected({})
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {t('Varre uma pasta por TODO/FIXME/HACK/XXX e cria tarefas no projeto escolhido.')}
      </p>

      <div className="space-y-3">
        <Toolbar
          actions={<Button onClick={scan} loading={scanning} disabled={scanning}>{t('Varrer')}</Button>}
        >
          <Input
            className="w-full sm:w-96"
            placeholder={t('Pasta do repositório...')}
            aria-label={t('Pasta do repositório...')}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && scan()}
          />
        </Toolbar>

        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('Projeto:')} className="w-full sm:w-64">
            <Select
              value={projectId}
              onValueChange={setProjectId}
              ariaLabel={t('Projeto:')}
              options={projects.map((p) => ({ value: String(p.id), label: `${p.key} — ${p.name}` }))}
            />
          </Field>
          <Button onClick={doImport} disabled={!items.length}>{t('Importar selecionados')}</Button>
        </div>

        {status && <p className="text-sm text-fg-muted">{status}</p>}
      </div>

      {items.length > 0 && (
        <Card padding="none" className="max-h-96 overflow-y-auto">
          <ul className="divide-y divide-border">
            {items.map((it, i) => (
              <li key={i} className="px-3 py-2">
                <Checkbox
                  checked={!!selected[i]}
                  onCheckedChange={(v) => setSelected({ ...selected, [i]: Boolean(v) })}
                  label={(
                    <span className="break-words">
                      <Badge variant="outline">{it.marker}</Badge>{' '}
                      <span className="text-fg-muted">{it.file}:{it.line}</span> — {it.text}
                    </span>
                  )}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function TriageTab() {
  const [text, setText] = useState('')
  const [triage, setTriage] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getProjects().then((ps) => {
      setProjects(ps)
      if (ps[0]) setProjectId(String(ps[0].id))
    }).catch(() => {})
  }, [])

  const run = async () => {
    if (!text.trim() || loading) return
    setLoading(true)
    setStatus(t('Triando...'))
    setTriage(null)
    try {
      const r = await triageBug({ text })
      setTriage(r.triage)
      setStatus('')
    } catch (e) {
      setStatus(e.response?.data?.detail || String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  const createTask = async () => {
    if (!projectId) return setStatus(t('Selecione um projeto'))
    try {
      const r = await triageBug({ text, projectId: Number(projectId), create: true })
      setStatus(`${t('Tarefa criada')}: ${r.task?.code || ''}`)
    } catch (e) {
      setStatus(e.response?.data?.detail || String(e.message || e))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {t('Cole um stacktrace/relato. A IA classifica e você cria uma tarefa BUG.')}
      </p>

      <Card>
        <Field label={t('Relato')}>
          <Textarea
            rows={6}
            className="font-mono"
            placeholder={t('Cole aqui o stacktrace ou a descrição do problema...')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <Button className="mt-3" onClick={run} loading={loading} disabled={loading}>
          {t('Triar com IA')}
        </Button>
      </Card>

      {triage && (
        <Card>
          <h3 className="break-words text-md font-semibold text-fg">{triage.title}</h3>
          <div className="mt-3 space-y-2 text-sm text-fg">
            <p className="text-fg-muted">
              {t('Severidade')}: <b className="text-fg">{triage.severity}</b> · {t('Prioridade')}:{' '}
              <b className="text-fg">{triage.priority}</b>
            </p>
            {triage.summary && <p>{triage.summary}</p>}
            {triage.probable_cause && (
              <p><b>{t('Causa provável')}:</b> {triage.probable_cause}</p>
            )}
            {triage.steps?.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {triage.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Field label={t('Projeto:')} className="w-full sm:w-64">
              <Select
                value={projectId}
                onValueChange={setProjectId}
                ariaLabel={t('Projeto:')}
                options={projects.map((p) => ({ value: String(p.id), label: `${p.key} — ${p.name}` }))}
              />
            </Field>
            <Button onClick={createTask}>{t('Criar tarefa BUG')}</Button>
          </div>
        </Card>
      )}

      {status && <p className="text-sm text-fg-muted">{status}</p>}
    </div>
  )
}

function CodeReviewTab() {
  const [path, setPath] = useState('')
  const [base, setBase] = useState('')
  const [taskCode, setTaskCode] = useState('')
  const [review, setReview] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const run = async (post) => {
    if (!path.trim()) return setStatus(t('Informe o caminho do repositório'))
    setLoading(true)
    setStatus(t('Revisando...'))
    try {
      const r = await codeReview({
        path, base, taskCode: post && taskCode.trim() ? taskCode.trim() : undefined,
      })
      setReview(r.review)
      setStatus(r.posted ? `${t('Comentário postado na tarefa')}` : '')
    } catch (e) {
      setStatus(e.response?.data?.detail || String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  const severityVariant = (severity) => {
    if (severity === 'HIGH') return 'danger'
    if (severity === 'MEDIUM') return 'warning'
    return 'neutral'
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {t('Aponte um repositório e uma base (branch/ref). A IA revisa o diff.')}
      </p>

      <Card>
        <Field label={t('Pasta do repositório...')}>
          <Input
            placeholder={t('Pasta do repositório...')}
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
        </Field>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label={t('Base')}>
            <Input
              placeholder={t('Base (ex.: main, HEAD~1) — vazio = alterações locais')}
              value={base}
              onChange={(e) => setBase(e.target.value)}
            />
          </Field>
          <Field label={t('Tarefa')}>
            <Input
              placeholder={t('Tarefa (ex.: PROJ-1)')}
              value={taskCode}
              onChange={(e) => setTaskCode(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => run(false)} loading={loading} disabled={loading}>
            {loading ? t('Revisando...') : t('Revisar com IA')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => run(true)}
            disabled={loading || !taskCode.trim()}
          >
            {t('Revisar e comentar na tarefa')}
          </Button>
          {status && <span className="text-sm text-fg-muted">{status}</span>}
        </div>
      </Card>

      {review && (
        <Card>
          {review.summary && <p className="text-sm text-fg">{review.summary}</p>}

          {review.issues?.length > 0 && (
            <div className="mt-3">
              <SectionTitle>{t('Problemas')}</SectionTitle>
              <ul className="mt-2 space-y-2 text-sm">
                {review.issues.map((it, i) => (
                  <li key={i} className="flex flex-wrap items-start gap-2">
                    <Badge variant={severityVariant(it.severity)}>{it.severity}</Badge>
                    <span className="min-w-0 break-words">
                      {it.file && <code className="text-xs text-fg-muted">{it.file}</code>}
                      {it.file ? ' — ' : ''}
                      {it.note}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review.suggestions?.length > 0 && (
            <div className="mt-3">
              <SectionTitle>{t('Sugestões')}</SectionTitle>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {review.suggestions.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}

          {review.truncated && (
            <p className="mt-2 text-xs text-fg-muted">{t('(diff truncado para revisão)')}</p>
          )}
        </Card>
      )}
    </div>
  )
}

function GitTab() {
  const [path, setPath] = useState('')
  const [st, setSt] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!path.trim()) return setStatus(t('Informe o caminho do repositório'))
    setLoading(true)
    setStatus('')
    try {
      const r = await gitStatus(path.trim(), true)
      setSt(r)
    } catch (e) {
      setStatus(e.response?.data?.detail || String(e.message || e))
      setSt(null)
    } finally {
      setLoading(false)
    }
  }

  const fileList = (title, files) => files?.length > 0 && (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <ul className="mt-1 space-y-1 text-xs">
        {files.map((x, i) => <li key={i} className="break-all"><code>{x}</code></li>)}
      </ul>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {t('Estado do repositório: branch, mudanças, commits e PRs (via gh).')}
      </p>

      <Card>
        <Toolbar
          actions={(
            <Button onClick={load} loading={loading} disabled={loading}>
              {loading ? t('Carregando...') : t('Atualizar')}
            </Button>
          )}
        >
          <Input
            className="w-full sm:w-96"
            placeholder={t('Pasta do repositório...')}
            aria-label={t('Pasta do repositório...')}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
        </Toolbar>
        {status && <p className="mt-3 text-sm text-fg-muted">{status}</p>}
      </Card>

      {st && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 font-semibold text-fg">
              <Icon name="layers" size={13} /> {st.branch}
            </span>
            <span className="text-sm text-fg-muted">↑{st.ahead} ↓{st.behind}</span>
            <Badge variant={st.clean ? 'success' : 'warning'}>
              {st.clean ? t('Limpo') : t('Com alterações')}
            </Badge>
          </div>

          {(st.staged?.length > 0 || st.unstaged?.length > 0 || st.untracked?.length > 0) && (
            <div className="mt-3 space-y-3">
              {fileList(t('Staged'), st.staged)}
              {fileList(t('Não-staged'), st.unstaged)}
              {fileList(t('Não rastreados'), st.untracked)}
            </div>
          )}

          {st.prs?.length > 0 && (
            <div className="mt-3">
              <SectionTitle>{t('Pull requests')}</SectionTitle>
              <ul className="mt-1 space-y-1 text-sm">
                {st.prs.map((p) => (
                  <li key={p.number}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline"
                    >
                      #{p.number}
                    </a>{' '}
                    {p.title} <span className="text-xs text-fg-muted">({p.branch})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3">
            <SectionTitle>{t('Commits recentes')}</SectionTitle>
            <ul className="mt-1 space-y-1 text-sm">
              {st.commits.map((c, i) => (
                <li key={i} className="break-words">
                  <code className="text-xs text-fg-muted">{c.hash}</code> {c.subject}{' '}
                  <span className="text-xs text-fg-muted">— {c.author}, {c.when}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  )
}

function fmtDur(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}m${String(s).padStart(2, '0')}s`
}

function TimeTab() {
  const [data, setData] = useState({ logs: [], weekSeconds: 0, weekByTask: [] })
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [taskCode, setTaskCode] = useState('')
  const [note, setNote] = useState('')
  const [minutes, setMinutes] = useState('')

  const load = () => getTimeLogs(50).then(setData).catch(() => {})
  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const stop = async () => {
    setRunning(false)
    if (elapsed > 0) {
      await logTime({ seconds: elapsed, taskCode: taskCode.trim() || undefined, note })
      load()
    }
    setElapsed(0)
  }

  const logManual = async () => {
    const mins = parseInt(minutes, 10)
    if (!mins || mins <= 0) return
    await logTime({ seconds: mins * 60, taskCode: taskCode.trim() || undefined, note })
    setMinutes('')
    load()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {t('Cronômetro e registro de tempo por tarefa. Total da semana e por tarefa.')}
      </p>

      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t('Tarefa')}>
            <Input
              placeholder={t('Tarefa (ex.: PROJ-1)')}
              value={taskCode}
              onChange={(e) => setTaskCode(e.target.value)}
            />
          </Field>
          <Field label={t('Nota (opcional)')} className="md:col-span-2">
            <Input
              placeholder={t('Nota (opcional)')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <span className="font-mono text-2xl tabular-nums text-fg">{fmtDur(elapsed)}</span>
          {!running
            ? <Button onClick={() => setRunning(true)}>{t('Iniciar')}</Button>
            : <Button variant="danger" onClick={stop}>{t('Parar e registrar')}</Button>}
          <span aria-hidden="true" className="text-fg-subtle">|</span>
          <div className="w-24">
            <Input
              placeholder={t('min')}
              aria-label={t('min')}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
          <Button variant="ghost" onClick={logManual}>{t('Registrar manual')}</Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`${t('Esta semana')}: ${fmtDur(data.weekSeconds)}`}
        />
        {data.weekByTask.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {data.weekByTask.map((r) => (
              <li key={r.taskCode}><b>{r.taskCode}</b> — {fmtDur(r.seconds)}</li>
            ))}
          </ul>
        )}
      </Card>

      <div>
        <SectionTitle className="mb-2">{t('Registros recentes')}</SectionTitle>
        <DataTable
          columns={[
            {
              key: 'seconds',
              header: t('Duração'),
              render: (l) => <span className="tabular-nums">{fmtDur(l.seconds)}</span>,
            },
            {
              key: 'taskCode',
              header: t('Tarefa'),
              render: (l) => (l.taskCode ? <Badge variant="outline">{l.taskCode}</Badge> : '—'),
            },
            {
              key: 'note',
              header: t('Nota'),
              render: (l) => <span className="text-fg-muted">{l.note || '—'}</span>,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (l) => (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('Excluir')}
                  title={t('Excluir')}
                  onClick={() => deleteTimeLog(l.id).then(load)}
                >
                  <Icon name="close" size={13} />
                </Button>
              ),
            },
          ]}
          rows={data.logs}
          rowKey={(l) => l.id}
          empty={t('Nenhum registro ainda.')}
        />
      </div>
    </div>
  )
}

export default function Biblioteca() {
  const [tab, setTab] = useState('snippets')
  const tabs = [
    { value: 'snippets', label: t('Snippets & Prompts'), content: <SnippetsTab /> },
    { value: 'runbooks', label: t('Runbooks'), content: <RunbooksTab /> },
    { value: 'import', label: t('Importar do código'), content: <ImportTab /> },
    { value: 'triage', label: t('Triagem de bugs'), content: <TriageTab /> },
    { value: 'review', label: t('Code review'), content: <CodeReviewTab /> },
    { value: 'git', label: t('Git'), content: <GitTab /> },
    { value: 'time', label: t('Tempo'), content: <TimeTab /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Biblioteca')}
        description={t('Snippets, prompts, comandos e importação de TODO/FIXME')}
      />

      <Tabs tabs={tabs} value={tab} onValueChange={setTab} ariaLabel={t('Biblioteca')} />
    </div>
  )
}
