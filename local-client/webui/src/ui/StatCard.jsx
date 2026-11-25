import clsx from 'clsx'
import { Badge } from './Badge.jsx'

// Círculo do ícone por tom. O padrão é o accent-soft do design.
const ICON_TONES = {
  accent: 'bg-accent-soft text-accent',
  neutral: 'bg-surface-2 text-fg-muted',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

function inferDeltaTone(text) {
  const value = String(text).trim()
  if (!value) return 'neutral'
  if (value.startsWith('-')) return 'danger'
  if (value.startsWith('+')) return 'success'
  return 'neutral'
}

function Delta({ delta }) {
  if (delta === null || delta === undefined || delta === false) return null

  if (typeof delta === 'object' && !Array.isArray(delta)) {
    const label = delta.label ?? delta.value
    return (
      <Badge variant={delta.variant || delta.tone || inferDeltaTone(label)} size="sm">
        {label}
      </Badge>
    )
  }

  return (
    <Badge variant={inferDeltaTone(delta)} size="sm">
      {delta}
    </Badge>
  )
}

export function StatCard({ label, value, icon, hint, tone = 'accent', delta, className }) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-xs',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-fg">
            {value}
          </div>
          {hint ? <div className="mt-1 text-xs text-fg-muted">{hint}</div> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Delta delta={delta} />
          {icon ? (
            <span
              className={clsx(
                'grid h-control-lg w-control-lg place-items-center rounded-full',
                ICON_TONES[tone] || ICON_TONES.accent,
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
