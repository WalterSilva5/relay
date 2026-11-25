import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMetrics, getActivity, getProjects, getDigest } from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon.jsx'
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, StatCard,
} from '../ui'

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
  const [loading, setLoading] = useState(true)
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
      .finally(() => setLoading(false))
  }, [])

  const s = metrics?.summary || {}
  const total = s.totalTasks || 0
  const entregues = s.deliveredTasks ?? s.doneTasks ?? 0
  const pct = s.deliveredPct ?? (total ? Math.round((entregues / total) * 100) : 0)
  const cards = [
    { lbl: t('Tarefas'), val: total, ico: 'clipboard', tone: 'accent' },
    { lbl: t('Entregues'), val: entregues, ico: 'check', tone: 'success', delta: { value: `${pct}%`, tone: 'success' } },
    { lbl: t('Lead time (h)'), val: s.avgLeadTimeHours != null ? Math.round(s.avgLeadTimeHours) : '—', ico: 'activity', tone: 'accent' },
    { lbl: t('Cycle time (h)'), val: s.avgCycleTimeHours != null ? Math.round(s.avgCycleTimeHours) : '—', ico: 'activity', tone: 'accent' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Dashboard')}
        description={t('Visão geral do workspace ativo (via API).')}
      />

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <StatCard
            key={c.lbl}
            label={c.lbl}
            value={loading ? <Skeleton w="w-16" h="h-8" /> : c.val}
            icon={<Icon name={c.ico} size={18} />}
            tone={c.tone}
            delta={loading ? null : c.delta}
          />
        ))}
      </div>

      <Card>
        <CardHeader
          title={t('Digest (standup)')}
          description={t('Gere um resumo "feito/fazendo/bloqueios" do seu trabalho recente.')}
          action={(
            <Button variant="secondary" onClick={runDigest} loading={digestLoading} disabled={digestLoading}>
              {digestLoading ? t('Gerando...') : t('Gerar com IA')}
            </Button>
          )}
        />

        {digest && (
          <div className="mt-4 space-y-3 text-sm text-fg">
            {digest.summary && <p>{digest.summary}</p>}
            {[
              ['done', t('Feito'), 'success'],
              ['doing', t('Fazendo'), 'accent'],
              ['blockers', t('Bloqueios'), 'danger'],
            ].map(([campo, rotulo, cor]) => (
              digest[campo]?.length > 0 && (
                <div key={campo} className="space-y-1.5">
                  <Badge variant={cor}>{rotulo}</Badge>
                  <ul className="list-disc space-y-1 pl-5">
                    {digest[campo].map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              )
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t('Atividade recente')} />

          {loading ? (
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} h="h-10" />)}
            </div>
          ) : activity.length === 0 ? (
            <EmptyState icon={<Icon name="activity" size={20} />} title={t('Nenhuma atividade.')} />
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  <Avatar name={a.entityType} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{ACTION_LABEL[a.action] || a.action}</Badge>
                      <span className="text-xs tabular-nums text-fg-muted">{fmtWhen(a.createdAt)}</span>
                    </div>
                    {a.detail ? <p className="mt-1 text-sm text-fg-muted">{a.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={t('Projetos')} />

          {loading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} h="h-9" />)}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState icon={<Icon name="folder" size={20} />} title={t('Nenhum projeto.')} />
          ) : (
            <div className="mt-3 space-y-1">
              {projects.map((p) => (
                <Button
                  key={p.id}
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => nav(`/board/${p.id}`)}
                >
                  <Badge variant="accent" className="shrink-0">{p.key}</Badge>
                  <span className="min-w-0 flex-1 truncate text-left">{p.name}</span>
                  <Icon name="chevronLeft" size={14} className="shrink-0 rotate-180 text-fg-subtle" />
                </Button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
