import { useEffect, useState } from 'react'
import {
  getBoard,
  getSprints,
  createSprint,
  updateSprint,
  completeSprint,
  deleteSprint,
  updateTask,
  getSprintRetro,
  generateSprintRetro,
  createRetroActions,
} from '../api'
import { t, tf } from '../i18n'
import {
  Badge, Button, Card, ConfirmDialog, DataTable, Dialog, Field, Input, Progress,
  SectionTitle, Select,
} from '../ui'

const STATUS_LABELS = { PLANEJADA: 'Planejada', ATIVA: 'Ativa', CONCLUIDA: 'Concluída' }
const STATUS_VARIANT = { PLANEJADA: 'neutral', ATIVA: 'accent', CONCLUIDA: 'success' }

const TYPE_VARIANT = {
  FEATURE: 'accent',
  BUG: 'danger',
  TECH_DEBT: 'warning',
  IMPROVEMENT: 'success',
  CHORE: 'neutral',
}
const PRIORITY_VARIANT = {
  LOW: 'neutral',
  MEDIUM: 'accent',
  HIGH: 'warning',
  URGENT: 'danger',
}

// Board de alocação: colunas = Backlog + cada sprint. Aqui o objetivo é
// distribuir o backlog nas sprints (não é o fluxo de trabalho).
export default function SprintPlanning({ projectId, onChanged }) {
  const [sprints, setSprints] = useState([])
  const [tasks, setTasks] = useState([]) // todas as tarefas não-arquivadas (achatadas)
  const [error, setError] = useState('')
  const [newSprint, setNewSprint] = useState({ name: '', goal: '', capacity: '', startDate: '', endDate: '' })
  const [retros, setRetros] = useState({}) // { [sprintId]: { retro, loading } }
  const [editingDates, setEditingDates] = useState({}) // { [sprintId]: bool }
  const [dateDrafts, setDateDrafts] = useState({}) // { [sprintId]: { startDate, endDate } }
  const [confirmSprint, setConfirmSprint] = useState(null)

  const openRetro = async (sp) => {
    setRetros((r) => ({ ...r, [sp.id]: { ...(r[sp.id] || {}), open: true } }))
    if (retros[sp.id]?.retro) return
    try {
      const r = await getSprintRetro(sp.id)
      setRetros((prev) => ({ ...prev, [sp.id]: { open: true, retro: r.retro } }))
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const runRetro = async (sp) => {
    setRetros((r) => ({ ...r, [sp.id]: { ...(r[sp.id] || {}), open: true, loading: true } }))
    try {
      const r = await generateSprintRetro(sp.id)
      setRetros((prev) => ({ ...prev, [sp.id]: { open: true, retro: r.retro, loading: false } }))
    } catch (e) {
      setRetros((prev) => ({ ...prev, [sp.id]: { ...(prev[sp.id] || {}), loading: false } }))
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const retroToTasks = async (sp) => {
    const actions = retros[sp.id]?.retro?.actions || []
    if (!actions.length) return
    try {
      await createRetroActions(sp.id, actions.map((a) => a.title))
      refreshAll()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const load = () => {
    getSprints(projectId)
      .then(setSprints)
      .catch((e) => setError(e.response?.data?.detail || String(e.message || e)))
    getBoard(projectId)
      .then((b) => setTasks(b.columns.flatMap((c) => c.tasks.map((tk) => ({ ...tk, isDone: c.isDone })))))
      .catch((e) => setError(e.response?.data?.detail || String(e.message || e)))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const refreshAll = () => {
    load()
    onChanged && onChanged()
  }

  const moveTaskToSprint = async (task, value) => {
    try {
      await updateTask(task.code, { sprintId: value === '' ? null : Number(value) })
      refreshAll()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const onCreateSprint = async () => {
    if (!newSprint.name.trim()) return
    try {
      await createSprint(Number(projectId), {
        name: newSprint.name.trim(),
        goal: newSprint.goal.trim() || null,
        capacity: newSprint.capacity ? Number(newSprint.capacity) : null,
        startDate: newSprint.startDate || null,
        endDate: newSprint.endDate || null,
      })
      setNewSprint({ name: '', goal: '', capacity: '', startDate: '', endDate: '' })
      refreshAll()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const act = (fn) => async (sp) => {
    try {
      await fn(sp)
      refreshAll()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }
  const activate = act((sp) => updateSprint(sp.id, { status: 'ATIVA' }))
  const complete = act((sp) => completeSprint(sp.id, {}))
  const remove = act((sp) => deleteSprint(sp.id))
  const saveDates = async (sp) => {
    const draft = dateDrafts[sp.id] || {}
    try {
      await updateSprint(sp.id, {
        startDate: draft.startDate !== undefined ? (draft.startDate || null) : undefined,
        endDate: draft.endDate !== undefined ? (draft.endDate || null) : undefined,
      })
      setDateDrafts((d) => { const n = { ...d }; delete n[sp.id]; return n })
      setEditingDates((e) => ({ ...e, [sp.id]: false }))
      refreshAll()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const tasksOf = (sid) => tasks.filter((tk) => (tk.sprintId ?? null) === sid)
  const committedOf = (sid) => tasksOf(sid).reduce((a, tk) => a + (tk.estimateMd || 0), 0)
  const doneOf = (sid) => tasksOf(sid).filter((tk) => tk.isDone).length

  const sprintSelectOptions = (task) => [
    { value: '__backlog__', label: t('Backlog') },
    ...sprints.map((sp) => ({ value: String(sp.id), label: sp.name })),
    ...(task.sprintId != null && !sprints.some((sp) => String(sp.id) === String(task.sprintId))
      ? [{ value: String(task.sprintId), label: String(task.sprintId) }]
      : []),
  ]

  const taskColumns = [
    {
      key: 'code',
      header: t('Código'),
      width: 'w-24',
      render: (task) => <span className="font-mono text-xs">{task.code}</span>,
    },
    {
      key: 'title',
      header: t('Título'),
      render: (task) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg">{task.title}</span>
          <span className="flex flex-wrap items-center gap-1">
            <Badge variant={TYPE_VARIANT[task.type] || 'neutral'} size="sm">{task.type}</Badge>
            <Badge variant={PRIORITY_VARIANT[task.priority] || 'neutral'} size="sm">{task.priority}</Badge>
            {task.estimateMd ? <span className="text-xs text-fg-muted">· {task.estimateMd}hd</span> : null}
          </span>
        </div>
      ),
    },
    {
      key: 'move',
      header: t('Mover para'),
      width: 'w-40',
      render: (task) => (
        <Select
          size="sm"
          value={task.sprintId != null ? String(task.sprintId) : '__backlog__'}
          onValueChange={(v) => moveTaskToSprint(task, v === '__backlog__' ? '' : v)}
          options={sprintSelectOptions(task)}
          ariaLabel={t('Mover para')}
        />
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Criar sprint */}
      <Card>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label={t('Nome da sprint')}>
            <Input
              value={newSprint.name}
              onChange={(e) => setNewSprint({ ...newSprint, name: e.target.value })}
            />
          </Field>
          <Field label={t('Meta/objetivo')}>
            <Input
              value={newSprint.goal}
              onChange={(e) => setNewSprint({ ...newSprint, goal: e.target.value })}
            />
          </Field>
          <Field label={t('Capacidade (hd)')}>
            <Input
              type="number"
              min="0"
              value={newSprint.capacity}
              onChange={(e) => setNewSprint({ ...newSprint, capacity: e.target.value })}
            />
          </Field>
          <Field label={t('De')}>
            <Input
              type="date"
              value={newSprint.startDate}
              onChange={(e) => setNewSprint({ ...newSprint, startDate: e.target.value })}
            />
          </Field>
          <Field label={t('Até')}>
            <Input
              type="date"
              value={newSprint.endDate}
              onChange={(e) => setNewSprint({ ...newSprint, endDate: e.target.value })}
            />
          </Field>
          <Button onClick={onCreateSprint}>{t('+ Criar sprint')}</Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* Coluna Backlog */}
        <Card padding="none">
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{t('Backlog')}</h3>
            <Badge variant="neutral">{tasksOf(null).length}</Badge>
          </div>
          <div className="p-3">
            <DataTable
              dense
              columns={taskColumns}
              rows={tasksOf(null)}
              rowKey={(task) => task.id}
              empty={t('Vazio')}
            />
          </div>
        </Card>

        {/* Uma coluna por sprint */}
        {sprints.map((sp) => {
          const committed = committedOf(sp.id)
          const list = tasksOf(sp.id)
          const over = sp.capacity != null && committed > sp.capacity
          const pct = sp.capacity ? Math.min(Math.round((committed / sp.capacity) * 100), 100) : 0
          return (
            <Card key={sp.id} padding="none">
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{sp.name}</h3>
                <Badge variant={STATUS_VARIANT[sp.status] || 'neutral'}>{t(STATUS_LABELS[sp.status] || sp.status)}</Badge>
                <Badge variant="neutral">{list.length}</Badge>
              </div>

              <div className="space-y-2 p-3">
                {sp.goal && <p className="text-xs text-fg-muted">{sp.goal}</p>}

                {(sp.startDate || sp.endDate) && !editingDates[sp.id] && (
                  <p className="font-mono text-xs text-fg-muted">
                    {(sp.startDate || '').slice(0, 10)} → {(sp.endDate || '').slice(0, 10)}
                  </p>
                )}

                {editingDates[sp.id] ? (
                  <div className="flex flex-wrap items-end gap-1.5">
                    <Input
                      type="date"
                      size="sm"
                      aria-label={t('De')}
                      className="w-36"
                      value={dateDrafts[sp.id]?.startDate ?? (sp.startDate || '').slice(0, 10)}
                      onChange={(e) => setDateDrafts((d) => ({ ...d, [sp.id]: { ...d[sp.id], startDate: e.target.value } }))}
                    />
                    <Input
                      type="date"
                      size="sm"
                      aria-label={t('Até')}
                      className="w-36"
                      value={dateDrafts[sp.id]?.endDate ?? (sp.endDate || '').slice(0, 10)}
                      onChange={(e) => setDateDrafts((d) => ({ ...d, [sp.id]: { ...d[sp.id], endDate: e.target.value } }))}
                    />
                    <Button variant="secondary" size="sm" onClick={() => saveDates(sp)}>{t('Salvar')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingDates((e) => ({ ...e, [sp.id]: false }))}>{t('Cancelar')}</Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setEditingDates((e) => ({ ...e, [sp.id]: true }))}>{t('Editar datas')}</Button>
                )}

                {/* Capacidade vs comprometido */}
                <div className={`text-xs ${over ? 'font-semibold text-danger' : 'text-fg-muted'}`}>
                  {tf('Comprometido {c}hd', { c: committed })}
                  {sp.capacity != null ? tf(' / capacidade {cap}hd', { cap: sp.capacity }) : ''}
                  {' · '}
                  {tf('{d}/{n} concluídas', { d: doneOf(sp.id), n: list.length })}
                </div>
                {sp.capacity != null && (
                  <Progress value={pct} tone={over ? 'danger' : 'accent'} size="sm" label={sp.name} />
                )}

                {/* Ações da sprint */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {sp.status !== 'ATIVA' && sp.status !== 'CONCLUIDA' && (
                    <Button variant="secondary" size="sm" onClick={() => activate(sp)}>{t('Ativar')}</Button>
                  )}
                  {sp.status !== 'CONCLUIDA' && (
                    <Button variant="secondary" size="sm" onClick={() => complete(sp)}>{t('Concluir')}</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openRetro(sp)}>{t('Retrospectiva')}</Button>
                  <Button variant="danger" size="sm" onClick={() => setConfirmSprint(sp)}>
                    {t('Excluir')}
                  </Button>
                </div>

                <DataTable
                  dense
                  columns={taskColumns}
                  rows={list}
                  rowKey={(task) => task.id}
                  empty={t('Vazio')}
                />
              </div>

              {retros[sp.id]?.open && (
                <Dialog
                  open
                  onOpenChange={(open) => setRetros((r) => ({ ...r, [sp.id]: { ...(r[sp.id] || {}), open } }))}
                  title={t('Retrospectiva')}
                  description={sp.name}
                  size="lg"
                  footer={(
                    <Button variant="secondary" onClick={() => setRetros((r) => ({ ...r, [sp.id]: { ...r[sp.id], open: false } }))}>
                      {t('Fechar')}
                    </Button>
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button variant="secondary" size="sm" loading={!!retros[sp.id]?.loading} disabled={!!retros[sp.id]?.loading} onClick={() => runRetro(sp)}>
                        {retros[sp.id]?.loading ? t('Gerando...') : (retros[sp.id]?.retro ? t('Regerar com IA') : t('Gerar com IA'))}
                      </Button>
                    </div>

                    {retros[sp.id]?.retro ? (
                      <div className="space-y-3">
                        {retros[sp.id].retro.well?.length > 0 && (
                          <div>
                            <SectionTitle>{t('O que foi bem')}</SectionTitle>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{retros[sp.id].retro.well.map((x, i) => <li key={i}>{x}</li>)}</ul>
                          </div>
                        )}
                        {retros[sp.id].retro.badly?.length > 0 && (
                          <div>
                            <SectionTitle>{t('O que pode melhorar')}</SectionTitle>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{retros[sp.id].retro.badly.map((x, i) => <li key={i}>{x}</li>)}</ul>
                          </div>
                        )}
                        {retros[sp.id].retro.actions?.length > 0 && (
                          <div>
                            <SectionTitle>{t('Ações')}</SectionTitle>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{retros[sp.id].retro.actions.map((a, i) => <li key={i}>{a.title}</li>)}</ul>
                            <Button variant="secondary" size="sm" className="mt-2" onClick={() => retroToTasks(sp)}>{t('Criar tarefas das ações')}</Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      !retros[sp.id]?.loading && <p className="text-sm text-fg-muted">{t('Sem retrospectiva ainda. Gere com IA.')}</p>
                    )}
                  </div>
                </Dialog>
              )}
            </Card>
          )
        })}
      </div>

      {sprints.length === 0 && <p className="text-sm text-fg-muted">{t('Crie uma sprint para começar a planejar.')}</p>}

      <ConfirmDialog
        open={!!confirmSprint}
        onOpenChange={(open) => { if (!open) setConfirmSprint(null) }}
        title={t('Excluir a sprint? As tarefas voltam ao backlog.')}
        confirmLabel={t('Excluir')}
        cancelLabel={t('Cancelar')}
        tone="danger"
        onConfirm={() => {
          const alvo = confirmSprint
          setConfirmSprint(null)
          if (alvo) remove(alvo)
        }}
      />
    </div>
  )
}
