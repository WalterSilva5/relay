import { useEffect, useState } from 'react'
import {
  getApiRequests,
  createApiRequest,
  updateApiRequest,
  deleteApiRequest,
  runApiRequest,
  getApiHistory,
} from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon'
import {
  Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea, Toolbar,
} from '../ui'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const EMPTY = { name: '', method: 'GET', url: '', headers: '', body: '' }

export default function ApiTester() {
  const [saved, setSaved] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [resp, setResp] = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState('')

  const loadSaved = () => getApiRequests().then(setSaved).catch(() => {})
  const loadHistory = () => getApiHistory({ limit: 20 }).then(setHistory).catch(() => {})

  useEffect(() => {
    loadSaved()
    loadHistory()
  }, [])

  const run = async () => {
    if (!form.url.trim()) return
    setLoading(true)
    setResp(null)
    try {
      const r = await runApiRequest({
        method: form.method, url: form.url, headers: form.headers,
        body: form.body, requestId: editing || undefined,
      })
      setResp(r)
      loadHistory()
    } catch (e) {
      setStatus(e.response?.data?.detail || String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    if (!form.name.trim() || !form.url.trim()) return setStatus(t('Informe nome e URL'))
    if (editing) await updateApiRequest(editing, form)
    else {
      const created = await createApiRequest(form)
      setEditing(created.id)
    }
    setStatus(t('Salvo'))
    loadSaved()
  }

  const load = (r) => {
    setEditing(r.id)
    setForm({ name: r.name, method: r.method, url: r.url, headers: r.headers, body: r.body })
    setResp(null)
  }

  const remove = async (id) => {
    await deleteApiRequest(id)
    if (editing === id) { setEditing(null); setForm(EMPTY) }
    loadSaved()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Testador de API')}
        description={t('Monte, execute e salve requisições HTTP (mini-Postman).')}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Toolbar
            actions={(
              <Button onClick={run} loading={loading}>
                {loading ? t('Executando...') : t('Executar')}
              </Button>
            )}
          >
            <div className="w-32 shrink-0">
              <Select
                value={form.method}
                onValueChange={(value) => setForm({ ...form, method: value })}
                ariaLabel="HTTP"
                options={METHODS.map((m) => ({ value: m, label: m }))}
              />
            </div>

            <div className="min-w-48 flex-1">
              <Input
                placeholder="https://..."
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                aria-label="URL"
              />
            </div>
          </Toolbar>

          <Card className="space-y-3">
            <Field label={t('Nome para salvar')}>
              <Input
                placeholder={t('Nome para salvar')}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label={t('Headers (JSON ou "Chave: valor" por linha)')}>
              <Textarea
                rows={3}
                className="font-mono text-sm"
                placeholder={t('Headers (JSON ou "Chave: valor" por linha)')}
                value={form.headers}
                onChange={(e) => setForm({ ...form, headers: e.target.value })}
              />
            </Field>

            <Field label={t('Corpo (body)')}>
              <Textarea
                rows={4}
                className="font-mono text-sm"
                placeholder={t('Corpo (body)')}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save}>{editing ? t('Atualizar') : t('Salvar')}</Button>
              {editing && (
                <Button variant="secondary" onClick={() => { setEditing(null); setForm(EMPTY) }}>
                  {t('Novo')}
                </Button>
              )}
              {status && <span className="text-sm text-fg-muted">{status}</span>}
            </div>
          </Card>

          {resp && (
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={resp.ok ? 'success' : 'danger'} size="md">
                  {resp.status ?? t('Erro')}
                </Badge>
                <span className="text-sm text-fg-muted">{resp.durationMs} ms</span>
              </div>

              {resp.error && (
                <div className="mt-3 rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger">
                  {resp.error}
                </div>
              )}

              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-mono text-sm text-fg">
                {resp.body}
              </pre>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('Salvos')} />
            <div className="mt-3 space-y-1">
              {saved.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-w-0"
                    onClick={() => load(r)}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-semibold">{r.method}</span> {r.name}
                    </span>
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    iconOnly
                    aria-label={t('Excluir')}
                    title={t('Excluir')}
                    onClick={() => remove(r.id)}
                  >
                    <Icon name="close" size={13} />
                  </Button>
                </div>
              ))}
            </div>
            {saved.length === 0 && (
              <p className="mt-2 text-sm text-fg-muted">{t('Nenhum request salvo.')}</p>
            )}
          </Card>

          <Card>
            <CardHeader title={t('Histórico')} />
            <div className="mt-3 space-y-2">
              {history.map((h) => (
                <div key={h.id} className="border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={h.ok ? 'success' : 'danger'}>{h.status ?? 'ERR'}</Badge>
                    <span className="font-semibold text-fg">{h.method}</span>
                    <span className="text-fg-muted">{h.durationMs}ms</span>
                  </div>
                  <div className="mt-0.5 break-all text-xs text-fg-muted">{h.url}</div>
                </div>
              ))}
            </div>
            {history.length === 0 && (
              <p className="mt-2 text-sm text-fg-muted">{t('Sem histórico.')}</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
