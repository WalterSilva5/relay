import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendingTodos, snoozeTodo } from '../api'
import { t, tf } from '../i18n'
import Icon from './Icon.jsx'
import { Button } from '../ui/index.js'

// Lembrete periódico (só na interface) de TODOs cujo horário já chegou.
export default function PendingTodosReminder() {
  const [pending, setPending] = useState({ count: 0, items: [] })
  const [dismissed, setDismissed] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const poll = () =>
      getPendingTodos()
        .then((p) => {
          setPending(p || { count: 0, items: [] })
          setDismissed(false) // reaparece a cada ciclo enquanto houver pendentes
        })
        .catch(() => {})
    poll()
    const id = setInterval(poll, 60000) // a cada 1 min
    return () => clearInterval(id)
  }, [])

  if (!pending.count || dismissed) return null

  const snoozeAll = async () => {
    try {
      await Promise.all((pending.items || []).map((it) => snoozeTodo(it.id, 10)))
    } catch {
      /* ignore */
    }
    setPending({ count: 0, items: [] })
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-40 flex w-80 max-w-[calc(100vw_-_2rem)] flex-col gap-2 rounded-lg border border-warning/40 bg-elevated p-3 shadow-lg"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
          <Icon name="calendar" size={15} />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-fg">
          {tf('{n} tarefa(s) pendente(s)', { n: pending.count })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t('Dispensar')}
          title={t('Dispensar')}
          onClick={() => setDismissed(true)}
        >
          <Icon name="close" size={14} />
        </Button>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <Button variant="secondary" size="sm" onClick={snoozeAll}>
          {t('Adiar 10min')}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setDismissed(true)
            navigate('/todos')
          }}
        >
          {t('Ver')}
        </Button>
      </div>
    </div>
  )
}
