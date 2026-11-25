import clsx from 'clsx'

const TONES = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

const SIZES = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
}

export function Progress({ value = 0, max = 100, tone = 'accent', size = 'md', label, className, ...props }) {
  const safeMax = Number(max) > 0 ? Number(max) : 100
  const current = Math.min(Math.max(Number(value) || 0, 0), safeMax)
  const percent = (current / safeMax) * 100

  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
      className={clsx(
        'w-full overflow-hidden rounded-full bg-border/50',
        SIZES[size] || SIZES.md,
        className,
      )}
      {...props}
    >
      <div
        className={clsx('h-full rounded-full transition-[width] duration-300 ease-out', TONES[tone] || TONES.accent)}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
