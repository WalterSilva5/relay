import { useEffect, useState } from 'react'
import { getKbNotes, createKbNote, updateKbNote, deleteKbNote, kbAsk } from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, SearchInput,
  Textarea, Toolbar,
} from '../ui'

const EMPTY = { title: '', body: '' }

export default function Base() {
  const [notes, setNotes] = useState([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null) // id em edição
  const [form, setForm] = useState(EMPTY)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () =>
    getKbNotes(q ? { q } : {})
      .then(setNotes)
      .catch((e) => setError(String(e.message || e)))

  useEffect(() => {
    load()
  }, [q])

  const openNew = () => { setSel(null); setForm(EMPTY) }
  const openNote = (n) => { setSel(n.id); setForm({ title: n.title || '', body: n.body || '' }) }

  const save = async () => {
    if (!form.title.trim() || saving) return
    setSaving(true)
    try {
      if (sel) await updateKbNote(sel, form)
      else {
        const created = await createKbNote(form)
        setSel(created.id)
      }
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    try {
      await deleteKbNote(id)
      if (sel === id) openNew()
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const ask = async () => {
    if (!question.trim() || asking) return
    setAsking(true)
    setAnswer(null)
    try {
      const r = await kbAsk({ question })
      setAnswer(r)
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    } finally {
      setAsking(false)
    }
  }

  const current = notes.find((n) => n.id === sel)

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Base de conhecimento')}
        description={t('Notas com backlinks [[título]] e perguntas respondidas pela IA sobre as suas notas.')}
      />

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <Toolbar
        actions={(
          <Button onClick={ask} loading={asking} disabled={asking}>
            {asking ? t('Pensando...') : t('Perguntar à IA')}
          </Button>
        )}
      >
        <Input
          className="w-full sm:w-96"
          placeholder={t('Pergunte à sua base...')}
          aria-label={t('Pergunte à sua base...')}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
        />
      </Toolbar>

      {answer && (
        <Card>
          <div className="space-y-2 text-sm text-fg">
            <div className="whitespace-pre-wrap">{answer.answer}</div>
            {answer.sources?.length > 0 && (
              <p className="text-xs text-fg-muted">
                {t('Fontes')}: {answer.sources.map((sc) => sc.title).join(', ')}
              </p>
            )}
          </div>
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-1">
          <Toolbar actions={<Button onClick={openNew}>{t('+ Nova')}</Button>}>
            <SearchInput
              className="w-full sm:w-56"
              placeholder={t('Buscar...')}
              aria-label={t('Buscar...')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Toolbar>

          <Card padding="none">
            {notes.length === 0 ? (
              <EmptyState
                icon={<Icon name="book" size={20} />}
                title={t('Nenhuma nota ainda.')}
              />
            ) : notes.map((n) => (
              <div
                key={n.id}
                className={`flex items-center gap-1 border-b border-border px-2 last:border-b-0 ${sel === n.id ? 'bg-accent-soft' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => openNote(n)}
                  aria-current={sel === n.id ? 'true' : undefined}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 py-2 text-left text-sm text-fg hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                >
                  <span className="truncate">{n.title}</span>
                  {n.backlinks?.length > 0 && (
                    <Badge variant="neutral" className="shrink-0">
                      <Icon name="layers" size={10} /> {n.backlinks.length}
                    </Badge>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('Excluir')}
                  title={t('Excluir')}
                  onClick={() => remove(n.id)}
                >
                  <Icon name="close" size={13} />
                </Button>
              </div>
            ))}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title={sel ? t('Editar nota') : t('Nova nota')}
              description={t('Conteúdo... use [[título]] para linkar outra nota')}
            />

            <div className="mt-4 space-y-3">
              <Field label={t('Título da nota')}>
                <Input
                  placeholder={t('Título da nota')}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>

              <Field label={t('Conteúdo')}>
                <Textarea
                  rows={14}
                  placeholder={t('Conteúdo... use [[título]] para linkar outra nota')}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={save} loading={saving} disabled={saving}>
                  {sel ? t('Salvar') : t('Criar nota')}
                </Button>
                {sel && <Button variant="ghost" onClick={openNew}>{t('+ Nova')}</Button>}
              </div>

              {current?.backlinks?.length > 0 && (
                <p className="text-xs text-fg-muted">
                  {t('Referenciada por')}: {current.backlinks.map((b) => b.title).join(', ')}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
