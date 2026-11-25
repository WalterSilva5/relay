import { useEffect, useState } from 'react'
import { getMetrics } from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon.jsx'
import {
  Card, CardHeader, Chip, DataTable, EmptyState, PageHeader, Progress, SectionTitle,
  Skeleton, StatCard,
} from '../ui'

// Lista de barras com o mesmo cálculo da versão anterior: cada linha mostra
// rótulo, contagem absoluta, barra proporcional e percentual.
function DistributionCard({ title, data }) {
  const entries = Object.entries(data)
  const total = entries.reduce((acc, [, v]) => acc + (v || 0), 0) || 1

  return (
    <Card>
      <CardHeader title={title} />

      {entries.length === 0 ? (
        <EmptyState title={t('Sem dados.')} />
      ) : (
        <div className="mt-4 space-y-2">
          {entries.map(([label, count]) => {
            const pct = Math.round(((count || 0) / total) * 100)
            return (
              <div key={label} className="flex items-center gap-3">
                <Chip className="w-28 shrink-0 justify-center">{label}</Chip>
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-fg-muted">{count}</span>
                <Progress value={pct} label={String(label)} className="min-w-0 flex-1" />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-fg-muted">{pct}%</span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export default function Metricas() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getMetrics()
      .then((m) => setMetrics(m))
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [])

  const s = metrics?.summary || {}
  const cards = [
    { lbl: t('Total'), val: s.totalTasks ?? '—', ico: 'clipboard', tone: 'accent' },
    { lbl: t('Entregues'), val: (s.deliveredTasks ?? s.doneTasks) ?? '—', ico: 'check', tone: 'success' },
    { lbl: t('Concluídas (Done)'), val: s.doneTasks ?? '—', ico: 'check', tone: 'success' },
    { lbl: t('Concluídas 7d'), val: s.completedLast7d ?? '—', ico: 'calendar', tone: 'accent' },
    { lbl: t('Concluídas 30d'), val: s.completedLast30d ?? '—', ico: 'calendar', tone: 'accent' },
    { lbl: t('Lead time médio (h)'), val: s.avgLeadTimeHours != null ? Math.round(s.avgLeadTimeHours) : '—', ico: 'activity', tone: 'accent' },
    { lbl: t('Cycle time médio (h)'), val: s.avgCycleTimeHours != null ? Math.round(s.avgCycleTimeHours) : '—', ico: 'activity', tone: 'accent' },
  ]

  const weekly = metrics?.weeklyThroughput || []
  const maxWeekly = weekly.reduce((mx, w) => Math.max(mx, w.count || 0), 0) || 1

  const byType = metrics?.byType || {}
  const byPriority = metrics?.byPriority || {}
  const perProject = metrics?.perProject || []

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Métricas')}
        description={t('Indicadores de fluxo e produtividade do workspace ativo (via API).')}
      />

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {loading && !error && (
        <div className="space-y-3" aria-busy="true">
          <p className="text-sm text-fg-muted">{t('Carregando…')}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} h="h-24" />)}
          </div>
        </div>
      )}

      {metrics && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <StatCard
                key={c.lbl}
                label={c.lbl}
                value={c.val}
                icon={<Icon name={c.ico} size={18} />}
                tone={c.tone}
              />
            ))}
          </div>

          <Card>
            <CardHeader title={t('Throughput semanal')} />

            {weekly.length === 0 ? (
              <EmptyState title={t('Sem dados.')} />
            ) : (
              <div className="mt-4 flex h-40 items-end gap-2">
                {weekly.map((w) => {
                  const height = Math.round(((w.count || 0) / maxWeekly) * 100)
                  return (
                    <div key={w.week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                      <span className="mb-1 text-xs tabular-nums text-fg-muted">{w.count}</span>
                      <div className="flex w-full flex-1 items-end justify-center">
                        <div
                          className="min-h-0.5 w-full max-w-10 rounded-t-sm bg-accent"
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span className="mt-1.5 text-center text-xs text-fg-muted">{w.week}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <DistributionCard title={t('Por tipo')} data={byType} />
            <DistributionCard title={t('Por prioridade')} data={byPriority} />
          </div>

          <section>
            <SectionTitle>{t('Por projeto')}</SectionTitle>
            <DataTable
              className="mt-2"
              columns={[
                {
                  key: 'project',
                  header: t('Projeto'),
                  render: (p) => (
                    <span className="flex flex-wrap items-baseline gap-1">
                      <span className="font-semibold text-fg">{p.projectKey}</span>
                      <span className="text-fg-muted">· {p.projectName}</span>
                    </span>
                  ),
                },
                {
                  key: 'delivered',
                  header: t('Entregues'),
                  align: 'right',
                  render: (p) => (
                    <span className="tabular-nums">{p.deliveredTasks ?? p.doneTasks}/{p.totalTasks}</span>
                  ),
                },
              ]}
              rows={perProject}
              rowKey={(p) => p.projectId}
              empty={t('Nenhum projeto.')}
            />
          </section>
        </>
      )}
    </div>
  )
}
