import clsx from 'clsx'

const PADDINGS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
}

const VARIANTS = {
  default: 'border border-border bg-surface shadow-xs',
  flat: 'border border-border bg-surface-2',
}

export function Card({ padding = 'md', variant = 'default', className, children, ...props }) {
  return (
    <div
      className={clsx(
        'rounded-lg',
        VARIANTS[variant] || VARIANTS.default,
        PADDINGS[padding] || PADDINGS.md,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// Cabeçalho de card: título, descrição opcional e uma ação alinhada à direita.
export function CardHeader({ title, description, action, className, children, ...props }) {
  return (
    <div className={clsx('flex items-start justify-between gap-3', className)} {...props}>
      <div className="min-w-0">
        {title ? <h3 className="truncate text-md font-semibold text-fg">{title}</h3> : null}
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
        {children}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

// Rótulo de seção em caixa alta, com peso e cor secundários.
export function SectionTitle({ as: Comp = 'h2', className, children, ...props }) {
  return (
    <Comp
      className={clsx('text-xs font-semibold uppercase tracking-wide text-fg-muted', className)}
      {...props}
    >
      {children}
    </Comp>
  )
}

export function Divider({ orientation = 'horizontal', className, ...props }) {
  const vertical = orientation === 'vertical'

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={clsx(
        'shrink-0 bg-border',
        vertical ? 'h-full w-px self-stretch' : 'h-px w-full',
        className,
      )}
      {...props}
    />
  )
}
