import { useEffect, useState } from 'react'
import { getTodos, addTodo, updateTodo, deleteTodo } from '../api'
import { t, tf } from '../i18n'
import Icon from '../components/Icon'
import {
  Button, Checkbox, DataTable, Input, PageHeader, Select, Toolbar,
} from '../ui'

const PRIORITIES = [
  ['LOW', 'Baixa'],
  ['MEDIUM', 'Média'],
  ['HIGH', 'Alta'],
]

const RECURRENCES = [
  ['NONE', 'Não repete'],
  ['DAILY', 'Diária'],
  ['WEEKLY', 'Semanal'],
  ['MONTHLY', 'Mensal'],
]

// ISO local (sem fuso) para o input datetime-local (também usado para exibir)
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Todos() {
  const [todos, setTodos] = useState([])
  const [text, setText] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [recurrence, setRecurrence] = useState('NONE')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState('')

  const load = () =>
    getTodos().then(setTodos).catch((e) => setError(String(e.message || e)))

  useEffect(() => {
    load()
  }, [])

  const onAdd = async () => {
    if (!text.trim()) return
    try {
      await addTodo({ text: text.trim(), priority, recurrence, dueAt: dueAt || null })
      setText('')
      setDueAt('')
      setPriority('MEDIUM')
      setRecurrence('NONE')
      setError('')
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  // Edição inline (prioridade, recorrência, prazo)
  const onEdit = async (id, patch) => {
    try {
      await updateTodo(id, patch)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const onToggle = async (todo) => {
    try {
      await updateTodo(todo.id, { done: !todo.done })
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const onDelete = async (id) => {
    try {
      await deleteTodo(id)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const onClearDone = async () => {
    try {
      for (const td of todos.filter((x) => x.done)) await deleteTodo(td.id)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  const sorted = [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  })
  const doneCount = todos.filter((x) => x.done).length
  const now = Date.now()

  const priorityOptions = PRIORITIES.map(([value, label]) => ({ value, label: t(label) }))
  const recurrenceOptions = RECURRENCES.map(([value, label]) => ({ value, label: t(label) }))

  const columns = [
    {
      key: 'done',
      header: <span className="sr-only">{t('Concluída')}</span>,
      width: 'w-10',
      render: (td) => (
        <Checkbox
          checked={!!td.done}
          onCheckedChange={() => onToggle(td)}
          label={<span className="sr-only">{t('Concluída')}</span>}
        />
      ),
    },
    {
      key: 'text',
      header: t('Pendência'),
      render: (td) => (
        <span className={td.done ? 'block min-w-40 text-fg-muted line-through' : 'block min-w-40 text-fg'}>
          {td.text}
        </span>
      ),
    },
    {
      key: 'priority',
      header: t('Prioridade'),
      width: 'w-32',
      render: (td) => (
        <div title={t('Prioridade')}>
          <Select
            size="sm"
            ariaLabel={t('Prioridade')}
            value={td.priority || 'MEDIUM'}
            onValueChange={(value) => onEdit(td.id, { priority: value })}
            options={priorityOptions}
          />
        </div>
      ),
    },
    {
      key: 'recurrence',
      header: t('Recorrência'),
      width: 'w-32',
      render: (td) => (
        <div title={t('Recorrência')}>
          <Select
            size="sm"
            ariaLabel={t('Recorrência')}
            value={td.recurrence || 'NONE'}
            onValueChange={(value) => onEdit(td.id, { recurrence: value })}
            options={recurrenceOptions}
          />
        </div>
      ),
    },
    {
      key: 'due',
      header: t('Agendar (opcional)'),
      width: 'w-48',
      render: (td) => {
        const overdue = !td.done && td.dueAt && new Date(td.dueAt).getTime() <= now
        const label = overdue ? t('Vencido') : t('Agendar (opcional)')
        return (
          <Input
            size="sm"
            type="datetime-local"
            title={label}
            aria-label={label}
            invalid={Boolean(overdue)}
            value={toLocalInput(td.dueAt)}
            onChange={(e) => onEdit(td.id, { dueAt: e.target.value || null })}
          />
        )
      },
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('Ações')}</span>,
      align: 'right',
      width: 'w-20',
      render: (td) => (
        <div className="flex items-center justify-end gap-1">
          {td.dueAt && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={t('Remover agendamento')}
              title={t('Remover agendamento')}
              onClick={() => onEdit(td.id, { dueAt: null })}
            >
              <Icon name="close" size={14} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t('Excluir')}
            title={t('Excluir')}
            onClick={() => onDelete(td.id)}
          >
            <Icon name="close" size={14} className="text-danger" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('TODOs')}
        description={t('Lista rápida de pendências.')}
      />

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <Toolbar>
        <div className="w-full sm:w-64">
          <Input
            placeholder={t('Nova pendência')}
            aria-label={t('Nova pendência')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          />
        </div>
        <div className="w-32" title={t('Prioridade')}>
          <Select
            ariaLabel={t('Prioridade')}
            value={priority}
            onValueChange={setPriority}
            options={priorityOptions}
          />
        </div>
        <div className="w-32" title={t('Recorrência')}>
          <Select
            ariaLabel={t('Recorrência')}
            value={recurrence}
            onValueChange={setRecurrence}
            options={recurrenceOptions}
          />
        </div>
        <div className="w-48">
          <Input
            type="datetime-local"
            title={t('Agendar (opcional)')}
            aria-label={t('Agendar (opcional)')}
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        <Button onClick={onAdd}>{t('Adicionar')}</Button>
      </Toolbar>

      <DataTable
        dense
        columns={columns}
        rows={sorted}
        rowKey={(td) => td.id}
        empty={t('Nenhuma pendência ainda.')}
      />

      <Toolbar
        actions={
          <Button variant="ghost" onClick={onClearDone} disabled={doneCount === 0}>
            {t('Limpar concluídos')}
          </Button>
        }
      >
        <span className="text-sm text-fg-muted">
          {tf('{done} de {total} concluídos', { done: doneCount, total: todos.length })}
        </span>
      </Toolbar>
    </div>
  )
}
