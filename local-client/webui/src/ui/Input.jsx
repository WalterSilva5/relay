import { forwardRef } from 'react'
import clsx from 'clsx'
import { useField } from './Field'
import { splitWidthClasses } from './utils.js'

const HEIGHTS = {
  sm: 'h-control-sm',
  md: 'h-control',
  lg: 'h-control-lg',
}

/**
 * Campo de texto de uma linha. Herda rótulo/erro do `Field` quando usado
 * dentro dele; `leadingIcon` e `trailing` são posicionados sobre o campo.
 */
export const Input = forwardRef(function Input(
  {
    invalid,
    leadingIcon,
    trailing,
    size = 'md',
    className,
    id,
    disabled,
    type = 'text',
    ...props
  },
  ref,
) {
  const field = useField()
  const isInvalid = invalid ?? field?.invalid ?? false
  const inputId = id ?? field?.id
  const { widths, rest } = splitWidthClasses(className)

  const input = (
    <input
      {...props}
      ref={ref}
      id={inputId}
      type={type}
      disabled={disabled}
      aria-invalid={isInvalid || undefined}
      aria-describedby={props['aria-describedby'] ?? field?.describedBy}
      aria-required={props['aria-required'] ?? (field?.required || undefined)}
      className={clsx(
        'w-full rounded-md border bg-surface text-base text-fg shadow-xs transition-colors',
        'placeholder:text-fg-subtle',
        'hover:border-border-strong',
        'focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-subtle disabled:opacity-60',
        HEIGHTS[size] || HEIGHTS.md,
        'px-3',
        leadingIcon && 'pl-8',
        trailing && 'pr-8',
        isInvalid
          ? 'border-danger focus-visible:border-danger focus-visible:ring-danger/25'
          : 'border-border',
        rest,
      )}
    />
  )

  if (!leadingIcon && !trailing) {
    return <div className={clsx(widths.length ? widths : 'w-full')}>{input}</div>
  }

  return (
    <div className={clsx('relative flex items-center', widths.length ? widths : 'w-full')}>
      {leadingIcon && (
        <span className="pointer-events-none absolute left-2.5 flex items-center text-fg-subtle">
          {leadingIcon}
        </span>
      )}
      {input}
      {trailing && (
        <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span>
      )}
    </div>
  )
})
