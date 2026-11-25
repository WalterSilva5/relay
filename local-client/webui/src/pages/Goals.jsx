import { useEffect, useState } from 'react'
import {
  getEpics,
  getGoals,
  createGoal,
  deleteGoal,
  getProjects,
  getSprints,
} from '../api'
import { t, tf } from '../i18n'
import Icon from '../components/Icon'
import {
  Badge,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Progress,
  Select,
} from '../ui'

function daysLabel(days) {
  if (days == null) return t('Sem data alvo')
  if (days < 0) return tf('Atrasado há {n}d', { n: Math.abs(days) })
  if (days === 0) return t('Vence hoje')
  return tf('Faltam {n}d', { n: days })
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
  const [confirmId, setConfirmId] = useState(null)
  const [deleting, setDeleting] = useState(false)

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

  const confirmDelete = async () => {
    if (confirmId == null) return
    setDeleting(true)
    try {
      await deleteGoal(confirmId)
      setConfirmId(null)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
      setConfirmId(null)
    } finally {
      setDeleting(false)
    }
  }

  const projectOptions = projects.map((p) => ({
    value: String(p.id),
    label: `${p.key} · ${p.name}`,
  }))
  const epicOptions = [
    { value: 'ANY', label: t('Épico: qualquer') },
    ...epics.map((e) => ({ value: String(e.id), label: e.name })),
  ]
  const sprintOptions = [
    { value: 'ANY', label: t('Sprint: qualquer') },
    ...sprints.map((s) => ({ value: String(s.id), label: s.name })),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Goals')}
        description={t('Objetivos com progresso e contagem regressiva.')}
      />

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label={t('Projeto')}>
            <Select
              value={projectId}
              onValueChange={setProjectId}
              options={projectOptions}
              placeholder={t('Projeto')}
            />
          </Field>
          <Field label={t('Nome do goal')} className="sm:col-span-2 xl:col-span-2">
            <Input
              placeholder={t('Nome do goal (ex.: entregar onda-1)')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t('Data alvo')}>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label={t('Tag')}>
            <Input
              placeholder={t('Tag (ex.: onda-1)')}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
          </Field>
          <Field label={t('Épico')}>
            <Select
              value={epicId || 'ANY'}
              onValueChange={(value) => setEpicId(value === 'ANY' ? '' : value)}
              options={epicOptions}
            />
          </Field>
          <Field label={t('Sprint')}>
            <Select
              value={sprintId || 'ANY'}
              onValueChange={(value) => setSprintId(value === 'ANY' ? '' : value)}
              options={sprintOptions}
            />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={onCreate}>{t('+ Criar goal')}</Button>
        </div>
      </Card>

      {goals.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Icon name="target" size={20} />}
            title={t('Nenhum goal ainda.')}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const p = g.progress || { total: 0, done: 0, pct: 0, daysLeft: null }
            const filters = [
              g.tag ? `#${g.tag}` : null,
              g.epic || null,
              g.sprint || null,
            ].filter(Boolean)
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 text-lg font-semibold text-fg">{g.name}</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label={t('Excluir')}
                    title={t('Excluir')}
                    onClick={() => setConfirmId(g.id)}
                  >
                    <Icon name="close" size={14} className="text-danger" />
                  </Button>
                </div>

                {filters.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {filters.map((f) => <Chip key={f}>{f}</Chip>)}
                  </div>
                )}

                {g.description && <p className="mt-2 text-sm text-fg-muted">{g.description}</p>}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Progress value={p.pct} className="min-w-24 flex-1" label={g.name} />
                  <Badge>{p.pct}% · {p.done}/{p.total}</Badge>
                  <Badge variant={p.daysLeft != null && p.daysLeft < 0 ? 'danger' : 'neutral'}>
                    {daysLabel(p.daysLeft)}
                  </Badge>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmId != null}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null)
        }}
        title={t('Excluir este goal?')}
        confirmLabel={t('Excluir')}
        cancelLabel={t('Cancelar')}
        tone="danger"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
