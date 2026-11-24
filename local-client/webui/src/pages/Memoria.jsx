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

const KINDS = [
  ['fact', 'Fato'],
  ['decision', 'Decisão'],
  ['preference', 'Preferência'],
  ['episode', 'Episódio'],
  ['procedure', 'Procedimento'],
  ['context', 'Contexto'],
]

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
      setStatus(t('Salvo'))
    } catch (e) {
      setStatus(apiError(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!sel) return
    if (!window.confirm(t('Excluir esta memória?'))) return
    try {
      await deleteMemoryEntry(sel)
      newEntry()
      load(kindFilter, '')
      getMemoryStats().then(setStats).catch(() => {})
    } catch (e) {
      setStatus(apiError(e))
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
    <div>
      <h1 className="page-title">{t('Memória agentic')}</h1>
      <p className="subtitle">{t('Fatos, decisões e contexto do workspace com busca semântica para agentes e IA.')}</p>
      {stats && (
        <p className="muted">
          {t('Total')}: {stats.total} · {t('Com embedding')}: {stats.withEmbedding}
          {stats.byKind ? ' · ' + Object.entries(stats.byKind).map(([k, v]) => `${k}=${v}`).join(', ') : ''}
        </p>
      )}

      <div className="toolbar" style={{ marginBottom: 10, alignItems: 'center' }}>
        <input
          style={{ flex: 1, minWidth: 200 }}
          placeholder={t('Buscar ou perguntar à memória...')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button onClick={search} disabled={busy}>{t('Buscar')}</button>
        <button className="ghost" onClick={ask} disabled={busy}>{t('Perguntar à IA')}</button>
      </div>
      {answer && <div className="card" style={{ whiteSpace: 'pre-wrap', marginBottom: 10 }}>{answer}</div>}

      <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
        <div style={{ flex: '0 0 280px', minWidth: 220 }}>
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <select value={kindFilter} onChange={(e) => { setKindFilter(e.target.value); load(e.target.value, '') }}>
              <option value="">{t('Todos os tipos')}</option>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
            <button className="ghost" onClick={newEntry}>{t('+ Nova')}</button>
          </div>
          <div style={{ maxHeight: 480, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entries.map((n) => (
              <div
                key={n.id}
                className="card"
                style={{ cursor: 'pointer', padding: '8px 10px', borderColor: sel === n.id ? 'var(--accent)' : undefined }}
                onClick={() => openEntry(n.id)}
              >
                <span className="muted">[{n.kind}]</span> {n.title || t('(sem título)')}
                {n.score != null && <span className="muted"> · {n.score}</span>}
              </div>
            ))}
            {entries.length === 0 && <div className="muted">{t('Nada aqui ainda.')}</div>}
          </div>
          <button className="ghost" style={{ marginTop: 8 }} onClick={remove} disabled={!sel}>{t('Excluir selecionada')}</button>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <input style={{ width: '100%', marginBottom: 8 }} placeholder={t('Título')} value={form.title} onChange={set('title')} />
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <select value={form.kind} onChange={set('kind')}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
            <label className="muted">{t('Importância')}</label>
            <input
              type="number" min="0" max="1" step="0.1" style={{ width: 70 }}
              value={form.importance} onChange={set('importance')}
            />
            <input style={{ flex: 1 }} placeholder={t('tags separadas por vírgula')} value={form.tags} onChange={set('tags')} />
          </div>
          <input style={{ width: '100%', marginBottom: 8 }} placeholder={t('Resumo curto (opcional)')} value={form.summary} onChange={set('summary')} />
          <textarea
            style={{ width: '100%', minHeight: 220 }}
            placeholder={t('Conteúdo da memória...')}
            value={form.content}
            onChange={set('content')}
          />
          <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
            <button onClick={save} disabled={busy}>{t('Salvar')}</button>
            {status && <span className="muted">{status}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
