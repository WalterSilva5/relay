import { cva } from 'class-variance-authority'
import clsx from 'clsx'

const badge = cva('inline-flex items-center whitespace-nowrap rounded-full font-medium leading-none', {
  variants: {
    variant: {
      neutral: 'border border-border bg-surface-2 text-fg-muted',
      accent: 'border border-accent/20 bg-accent-soft text-accent',
      success: 'border border-success/20 bg-success-soft text-success',
      warning: 'border border-warning/20 bg-warning-soft text-warning',
      danger: 'border border-danger/20 bg-danger-soft text-danger',
      outline: 'border border-border-strong text-fg-muted',
    },
    size: {
      sm: 'h-5 gap-1 px-2 text-xs',
      md: 'h-6 gap-1.5 px-2.5 text-sm',
    },
  },
  defaultVariants: {
    variant: 'neutral',
    size: 'sm',
  },
})

export function Badge({ variant = 'neutral', size = 'sm', className, children, ...props }) {
  return (
    <span className={clsx(badge({ variant, size }), className)} {...props}>
      {children}
    </span>
  )
}

// Chip é o Badge com um ponto de status opcional à esquerda.
export function Chip({ dot = false, className, children, ...props }) {
  return (
    <Badge className={className} {...props}>
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </Badge>
  )
}
