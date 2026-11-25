import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCoachConfig, getCoachTip } from '../api'
import { t } from '../i18n'
import Icon from './Icon.jsx'
import { Button } from '../ui/index.js'

// Coach proativo: busca uma dica curta e acionável do agente ao longo do dia
// (a mesma do desktop) e a exibe num painel não intrusivo no canto inferior.
export default function CoachTip() {
  const [tip, setTip] = useState(null) // { tip, category }
  const [dismissed, setDismissed] = useState(false)
  const navigate = useNavigate()
  const timerRef = useRef(null)
  const recentRef = useRef([])

  useEffect(() => {
    let cancelled = false

    const fetchTip = async () => {
      try {
        const data = await getCoachTip()
        const text = (data && data.tip ? String(data.tip) : '').trim()
        if (cancelled || !text) return
        if (recentRef.current.includes(text)) return // evita repetir a mesma dica
        recentRef.current = [...recentRef.current, text].slice(-5)
        setTip({ tip: text, category: (data.category || '').trim() })
        setDismissed(false)
      } catch {
        /* sem provedor / erro: silencioso */
      }
    }

    const schedule = async () => {
      let intervalMin = 90
      let enabled = true
      try {
        const cfg = await getCoachConfig()
        enabled = cfg?.enabled !== false
        intervalMin = Math.max(15, Number(cfg?.interval_min) || 90)
      } catch {
        /* usa defaults */
      }
      if (cancelled || !enabled) return
      // Primeira dica pouco depois de abrir; depois no intervalo configurado.
      const first = setTimeout(fetchTip, 90000)
      timerRef.current = setInterval(fetchTip, intervalMin * 60000)
      return () => clearTimeout(first)
    }

    const cleanupFirst = schedule()
    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
      Promise.resolve(cleanupFirst).then((fn) => typeof fn === 'function' && fn())
    }
  }, [])

  if (!tip || dismissed) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-40 flex w-80 max-w-[calc(100vw_-_2rem)] flex-col gap-2.5 rounded-lg border border-accent/30 bg-elevated p-3 shadow-lg"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon name="sparkles" size={15} />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-fg">
          {t('Dica do agente')}
          {tip.category ? <span className="ml-1 font-normal text-fg-muted">· {tip.category}</span> : null}
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
      <p className="text-sm leading-relaxed text-fg-muted">{tip.tip}</p>
      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setDismissed(true)
            navigate('/assistente')
          }}
        >
          {t('Abrir Assistente')}
        </Button>
      </div>
    </div>
  )
}
