import { useEffect, useState } from 'react'
import Swal from 'sweetalert2'
import {
  getEpics,
  getGoals,
  createGoal,
  deleteGoal,
  getProjects,
  getSprints,
} from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon'

function daysLabel(days) {
  if (days == null) return t('Sem data alvo')
  if (days < 0) return t('Atrasado há {n}d', { n: Math.abs(days) })
  if (days === 0) return t('Vence hoje')
  return t('Faltam {n}d', { n: days })
}

export default function Goals() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [goals, setGoals] = useState([])
  const [epics, setEpics] = useState([])
  const [sprints, setSprints] = useState([])
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [tag, setTag] = useState('')
  const [epicId, setEpicId] = useState('')
  const [sprintId, setSprintId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getProjects()
      .then((ps) => {
        setProjects(ps)
        if (ps.length > 0) setProjectId((cur) => cur || String(ps[0].id))
      })
      .catch((e) => setError(String(e.message || e)))
  }, [])

  const load = () => {
    if (!projectId) return
    Promise.all([getGoals(projectId), getEpics(projectId), getSprints(projectId)])
      .then(([gs, es, ss]) => {
        setGoals(gs)
        setEpics(es)
        setSprints(ss)
      })
      .catch((e) => setError(String(e.message || e)))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [projectId])

  const onCreate = async () => {
    if (!name.trim()) return
    try {
      await createGoal(projectId, {
        name: name.trim(),
        dueDate: dueDate || null,
        tag: tag.trim() || null,
        epicId: epicId ? Number(epicId) : null,
        sprintId: sprintId ? Number(sprintId) : null,
      })
      setName('')
      setDueDate('')
      setTag('')
      setEpicId('')
      setSprintId('')
      setError('')
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const onDelete = async (id) => {
    const res = await Swal.fire({
      title: t('Excluir este goal?'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Excluir'),
      cancelButtonText: t('Cancelar'),
    })
    if (!res.isConfirmed) return
    try {
      await deleteGoal(id)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  return (
    <div>
      <h1 className="page-title">{t('Goals')}</h1>
      <p className="subtitle">{t('Objetivos com progresso e contagem regressiva.')}</p>

      {error && <div className="banner">{error}</div>}

      <div className="toolbar">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.key} · {p.name}
            </option>
          ))}
        </select>
        <input
          placeholder={t('Nome do goal (ex.: entregar onda-1)')}
          value={name}
          style={{ minWidth: 220 }}
          onChange={(e) => setName(e.target.value)}
        />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <input
          placeholder={t('Tag (ex.: onda-1)')}
          value={tag}
          style={{ width: 130 }}
          onChange={(e) => setTag(e.target.value)}
        />
        <select value={epicId} onChange={(e) => setEpicId(e.target.value)}>
          <option value="">{t('Épico: qualquer')}</option>
          {epics.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
          <option value="">{t('Sprint: qualquer')}</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button onClick={onCreate}>{t('+ Criar goal')}</button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
          marginTop: 12,
        }}
      >
        {goals.map((g) => {
          const p = g.progress || { total: 0, done: 0, pct: 0, daysLeft: null }
          const filters = [
            g.tag ? `#${g.tag}` : null,
            g.epic || null,
            g.sprint || null,
          ].filter(Boolean)
          return (
            <div key={g.id} className="card" style={{ minHeight: 130 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{g.name}</div>
                <button
                  className="ghost sm"
                  title={t('Excluir')}
                  onClick={() => onDelete(g.id)}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              {filters.length > 0 && (
                <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {filters.map((f) => <span key={f} className="chip">{f}</span>)}
                </div>
              )}
              {g.description && <div style={{ fontSize: 13, marginTop: 4 }}>{g.description}</div>}
              <div className="row" style={{ marginTop: 10 }}>
                <div className="progress" style={{ flex: 1 }}>
                  <span style={{ width: `${p.pct}%` }} />
                </div>
                <span className="chip">{p.pct}% · {p.done}/{p.total}</span>
                <span className={p.daysLeft != null && p.daysLeft < 0 ? 'chip danger' : 'chip'}>
                  {daysLabel(p.daysLeft)}
                </span>
              </div>
            </div>
          )
        })}
        {goals.length === 0 && <div className="muted">{t('Nenhum goal ainda.')}</div>}
      </div>
    </div>
  )
}
