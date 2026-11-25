import { useEffect, useState } from 'react'
import {
  getTask,
  updateTask,
  getComments,
  addComment,
  addChecklist,
  toggleChecklist,
  deleteChecklist,
  getMembers,
  createMember,
} from '../api'
import { apiError } from '../api'
import { t, tf } from '../i18n'
import Icon from './Icon.jsx'
import {
  Avatar, Button, Card, Checkbox, Dialog, Field, Input, SectionTitle, Select, Skeleton, Textarea,
} from '../ui'

const TYPES = ['FEATURE', 'BUG', 'TECH_DEBT', 'IMPROVEMENT', 'CHORE']
const PRIOS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

export default function TaskDetail({ code, onClose, onChanged }) {
  const [task, setTask] = useState(null)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [newCheck, setNewCheck] = useState('')
  const [error, setError] = useState('')
  const [members, setMembers] = useState([])
  const [newAssignee, setNewAssignee] = useState('')
  const [showNewAssignee, setShowNewAssignee] = useState(false)

  const load = async () => {
    try {
      const detail = await getTask(code)
      setTask(detail)
      setComments(await getComments(detail.id))
      if (detail.projectId) {
        try { setMembers(await getMembers(detail.projectId)) } catch { setMembers([]) }
      }
    } catch (e) { setError(String(e.message || e)) }
  }

  useEffect(() => {
    load()
  }, [code])

  const patch = async (body) => {
    try {
      await updateTask(code, body)
      await load()
      onChanged?.()
    } catch (e) {
      setError(apiError(e))
    }
  }

  const assignMember = async (name) => {
    const val = (name || '').trim() || null
    try {
      if (val && task?.projectId) {
        try { await createMember(task.projectId, { name: val }) } catch {}
        try { setMembers(await getMembers(task.projectId)) } catch {}
      }
      await patch({ assignee: val })
    } catch (e) { setError(String(e.message || e)) }
  }

  const submitComment = async () => {
    if (!newComment.trim()) return
    await addComment(task.id, newComment.trim())
    setNewComment('')
    setComments(await getComments(task.id))
  }

  const submitCheck = async () => {
    if (!newCheck.trim()) return
    await addChecklist(code, newCheck.trim())
    setNewCheck('')
    load()
  }

  if (!task) {
    return (
      <Dialog
        open
        onOpenChange={(open) => { if (!open) onClose() }}
        title={error ? t('Erro') : t('Carregando...')}
        size="lg"
      >
        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <div className="space-y-3" aria-busy="true">
            <Skeleton w="w-32" h="h-3" />
            <Skeleton w="w-full" h="h-6" />
            <Skeleton w="w-2/3" h="h-4" />
          </div>
        )}
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={task.title}
      description={<span className="font-mono">{task.code}</span>}
      size="lg"
    >
      <div className="space-y-5">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('Tipo')} className="min-w-40 flex-1">
            <Select
              value={task.type}
              onValueChange={(value) => patch({ type: value })}
              options={TYPES.map((type) => ({ value: type, label: type }))}
            />
          </Field>
          <Field label={t('Prioridade')} className="min-w-40 flex-1">
            <Select
              value={task.priority}
              onValueChange={(value) => patch({ priority: value })}
              options={PRIOS.map((p) => ({ value: p, label: p }))}
            />
          </Field>
        </div>

        <div title={t('Card que existe só aqui: o sync do board externo não cria, não atualiza e não apaga.')}>
          <Checkbox
            label={t('Tarefa local (não sincroniza)')}
            checked={!!task.isLocal}
            onCheckedChange={(value) => patch({ isLocal: !!value })}
          />
        </div>

        <div className="space-y-2">
          <SectionTitle>{t('Responsável')}</SectionTitle>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Select
                value={task.assignee || '__none__'}
                onValueChange={(v) => {
                  if (v === '__new__') setShowNewAssignee(true)
                  else if (v === '__none__') assignMember('')
                  else assignMember(v)
                }}
                ariaLabel={t('Responsável')}
                options={[
                  { value: '__none__', label: t('Sem responsável') },
                  ...members.map((m) => ({ value: m.name, label: m.name })),
                  ...(task.assignee && !members.some((m) => m.name === task.assignee)
                    ? [{ value: task.assignee, label: `${task.assignee} (legado)` }]
                    : []),
                  { value: '__new__', label: t('+ Novo responsável...') },
                ]}
              />
            </div>
            {task.assignee && <Avatar name={task.assignee} size="md" title={task.assignee} />}
          </div>

          {showNewAssignee && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t('Nome do responsável...')} className="min-w-48 flex-1">
                <Input
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newAssignee.trim()) {
                      await assignMember(newAssignee.trim())
                      setNewAssignee('')
                      setShowNewAssignee(false)
                    }
                  }}
                />
              </Field>
              <Button
                onClick={async () => {
                  if (!newAssignee.trim()) return
                  await assignMember(newAssignee.trim())
                  setNewAssignee('')
                  setShowNewAssignee(false)
                }}
              >
                {t('Atribuir')}
              </Button>
              <Button variant="ghost" onClick={() => setShowNewAssignee(false)}>{t('Cancelar')}</Button>
            </div>
          )}

          <p className="text-xs text-fg-muted">{t('Facilita filtro e métricas por pessoa.')}</p>
        </div>

        <div className="space-y-2">
          <SectionTitle>{t('Descrição')}</SectionTitle>
          <Textarea
            className="min-h-24"
            aria-label={t('Descrição')}
            defaultValue={task.description || ''}
            onBlur={(e) => e.target.value !== (task.description || '') && patch({ description: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <SectionTitle>{t('Checklist')}</SectionTitle>
          <div className="space-y-1">
            {(task.checklist || []).map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5">
                <Checkbox
                  id={`task-check-${c.id}`}
                  checked={!!c.checked}
                  onCheckedChange={() => toggleChecklist(c.id).then(load)}
                  className="mt-0"
                />
                <label
                  htmlFor={`task-check-${c.id}`}
                  className={`min-w-0 flex-1 cursor-pointer text-sm ${c.checked ? 'text-fg-subtle line-through' : 'text-fg'}`}
                >
                  {c.title}
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={`${t('Excluir')} ${c.title}`}
                  title={t('Excluir')}
                  onClick={() => deleteChecklist(c.id).then(load)}
                >
                  <Icon name="close" size={14} />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              placeholder={t('Novo item...')}
              aria-label={t('Novo item...')}
              className="flex-1"
              value={newCheck}
              onChange={(e) => setNewCheck(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCheck()}
            />
            <Button
              variant="secondary"
              iconOnly
              aria-label={t('Adicionar item')}
              title={t('Adicionar item')}
              onClick={submitCheck}
            >
              <Icon name="plus" size={16} />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <SectionTitle>{tf('Comentários ({n})', { n: comments.length })}</SectionTitle>
          {comments.map((c) => (
            <Card key={c.id} padding="sm" variant="flat">
              <div className="text-xs text-fg-muted">{c.type} · {c.author || 'local'}</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-fg">{c.body}</div>
            </Card>
          ))}

          <div className="flex items-center gap-1.5">
            <Input
              placeholder={t('Comentário...')}
              aria-label={t('Comentário...')}
              className="flex-1"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitComment()}
            />
            <Button onClick={submitComment}>{t('Enviar')}</Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
