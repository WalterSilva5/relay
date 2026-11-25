import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMetrics, getActivity, getProjects, getDigest } from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon.jsx'

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Rótulo curto e legível para o log de atividade.
const ACTION_LABEL = {
  created: 'criada',
  moved: 'movida',
  archived: 'arquivada',
  unarchived: 'desarquivada',
  updated: 'atualizada',
  deleted: 'removida',
  commented: 'comentada',
  daily_imported: 'daily importado',
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null)
  const [activity, setActivity] = useState([])
  const [projects, setProjects] = useState([])
  const [error, setError] = useState('')
  const [digest, setDigest] = useState(null)
  const [digestLoading, setDigestLoading] = useState(false)
  const nav = useNavigate()

  const runDigest = () => {
    setDigestLoading(true)
    getDigest(1)
      .then(setDigest)
      .catch((e) => setError(e.response?.data?.detail || String(e.message || e)))
      .finally(() => setDigestLoading(false))
  }

  useEffect(() => {
    Promise.all([getMetrics(), getActivity(15), getProjects()])
      .then(([m, a, p]) => {
        setMetrics(m)
        setActivity(a)
        setProjects(p)
      })
      .catch((e) => setError(String(e.message || e)))
  }, [])

  const s = metrics?.summary || {}
  const total = s.totalTasks || 0
  const entregues = s.deliveredTasks ?? s.doneTasks ?? 0
  const pct = s.deliveredPct ?? (total ? Math.round((entregues / total) * 100) : 0)
  const cards = [
    { lbl: t('Tarefas'), val: total, ico: 'clipboard' },
    { lbl: t('Entregues'), val: entregues, ico: 'check', chip: `${pct}%` },
    { lbl: t('Lead time (h)'), val: s.avgLeadTimeHours != null ? Math.round(s.avgLeadTimeHours) : '—', ico: 'activity' },
    { lbl: t('Cycle time (h)'), val: s.avgCycleTimeHours != null ? Math.round(s.avgCycleTimeHours) : '—', ico: 'activity' },
  ]

  return (
    <div>
      <h1 className="page-title">{t('Dashboard')}</h1>
      <p className="subtitle">{t('Visão geral do workspace ativo (via API).')}</p>
      {error && <div className="banner">{error}</div>}

      <div className="cards-row">
        {cards.map((c) => (
          <div key={c.lbl} className="card summary">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ display: 'grid', placeItems: 'center' }}>
                <Icon name={c.ico} size={16} />
              </span>
              {c.chip && <span className="chip success">{c.chip}</span>}
            </div>
            <div className="val">{c.val}</div>
            <div className="lbl">{c.lbl}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div className="section-title" style={{ margin: 0 }}>{t('Digest (standup)')}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {t('Gere um resumo "feito/fazendo/bloqueios" do seu trabalho recente.')}
            </div>
          </div>
          <button className="ghost" onClick={runDigest} disabled={digestLoading}>
            {digestLoading ? t('Gerando...') : t('Gerar com IA')}
          </button>
        </div>
        {digest && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            {digest.summary && <p style={{ marginTop: 0 }}>{digest.summary}</p>}
            {[
              ['done', t('Feito'), 'success'],
              ['doing', t('Fazendo'), 'accent'],
              ['blockers', t('Bloqueios'), 'danger'],
            ].map(([campo, rotulo, cor]) => (
              digest[campo]?.length > 0 && (
                <div key={campo} style={{ marginTop: 8 }}>
                  <span className={`chip ${cor}`}>{rotulo}</span>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {digest[campo].map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              )
            ))}
          </div>
        )}
      </div>

      <div className="row" style={{ alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '2 1 420px', minWidth: 0 }}>
          <div className="section-title">{t('Atividade recente')}</div>
          {activity.length === 0 && <div className="muted">{t('Nenhuma atividade.')}</div>}
          {activity.map((a) => (
            <div key={a.id} className="activity-item">
              <span className="when">{fmtWhen(a.createdAt)}</span>
              <span>
                <span className="chip" style={{ marginRight: 6 }}>{ACTION_LABEL[a.action] || a.action}</span>
                {a.detail || ''}
              </span>
            </div>
          ))}
        </div>

        <div className="card" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div className="section-title">{t('Projetos')}</div>
          {projects.length === 0 && <div className="muted">{t('Nenhum projeto.')}</div>}
          {projects.map((p) => (
            <button
              key={p.id}
              className="ghost"
              onClick={() => nav(`/board/${p.id}`)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, textAlign: 'left' }}
            >
              <span className="chip accent">{p.key}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <Icon name="chevronLeft" size={14} style={{ transform: 'rotate(180deg)', opacity: .6 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
