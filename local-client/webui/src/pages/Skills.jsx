import { useEffect, useState } from 'react'
import { getSkills, getSkill, apiError } from '../api'
import { t } from '../i18n'

export default function Skills() {
  const [skills, setSkills] = useState([])
  const [categories, setCategories] = useState({})
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    getSkills()
      .then((r) => {
        setSkills(r.skills || [])
        setCategories(r.categories || {})
      })
      .catch((e) => setStatus(apiError(e)))
  }, [])

  const openPreview = async (id) => {
    setStatus('')
    try {
      const s = await getSkill(id)
      setPreview(s)
    } catch (e) {
      setStatus(apiError(e))
    }
  }

  const copy = () => {
    if (preview?.content && navigator.clipboard) {
      navigator.clipboard.writeText(preview.content)
      setStatus(t('Copiado!'))
    }
  }

  const download = () => {
    if (!preview?.content) return
    const blob = new Blob([preview.content], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'SKILL.md'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const query = q.trim().toLowerCase()
  const visible = skills.filter((s) => {
    if (cat && s.category !== cat) return false
    if (query && !`${s.name} ${s.description} ${(s.tags || []).join(' ')}`.toLowerCase().includes(query)) return false
    return true
  })

  return (
    <div>
      <h1 className="page-title">{t('Skills')}</h1>
      <p className="subtitle">{t('Skills são instruções que ensinam agentes de IA a interagir com o Relay.')}</p>
      <p className="muted">{t('A instalação em .claude/skills/ é feita no app desktop (aba Skills). Aqui você visualiza, copia ou baixa o conteúdo.')}</p>

      <div className="toolbar" style={{ marginBottom: 10, alignItems: 'center' }}>
        <input
          style={{ flex: 1, minWidth: 180 }}
          placeholder={t('Buscar skills...')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">{t('Todos')}</option>
          {Object.entries(categories).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>
      {status && <p className="muted">{status}</p>}

      {preview && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <b>{preview.name}</b>
            <span className="muted">{preview.filename}</span>
            <span style={{ flex: 1 }} />
            <button className="ghost" onClick={copy}>{t('Copiar')}</button>
            <button className="ghost" onClick={download}>{t('Baixar SKILL.md')}</button>
            <button className="ghost" onClick={() => setPreview(null)}>{t('Fechar preview')}</button>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>{preview.content}</pre>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {visible.map((s) => (
          <div key={s.id} className="card">
            <div style={{ fontWeight: 700 }}>{s.name}</div>
            <div className="muted" style={{ fontSize: 12, margin: '4px 0' }}>{s.categoryLabel || s.category}</div>
            <div style={{ fontSize: 13 }}>{s.description}</div>
            {(s.tags?.length > 0) && (
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{s.tags.join(' · ')}</div>
            )}
            <div style={{ marginTop: 8 }}>
              <button className="ghost" onClick={() => openPreview(s.id)}>{t('Ver conteúdo')}</button>
            </div>
          </div>
        ))}
      </div>
      {visible.length === 0 && <div className="muted" style={{ marginTop: 10 }}>{t('Nada aqui ainda.')}</div>}
    </div>
  )
}
