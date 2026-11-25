import { forwardRef } from 'react'
import clsx from 'clsx'
import { useField } from './Field'

/**
 * Campo de texto multilinha. Mesmas cores e estados do `Input`, com altura
 * mínima confortável e redimensionamento apenas vertical.
 */
export const Textarea = forwardRef(function Textarea(
  { invalid, className, id, disabled, rows = 3, ...props },
  ref,
) {
  const field = useField()
  const isInvalid = invalid ?? field?.invalid ?? false
  const textareaId = id ?? field?.id

  return (
    <textarea
      {...props}
      ref={ref}
      id={textareaId}
      rows={rows}
      disabled={disabled}
      aria-invalid={isInvalid || undefined}
      aria-describedby={props['aria-describedby'] ?? field?.describedBy}
      aria-required={props['aria-required'] ?? (field?.required || undefined)}
      className={clsx(
        'min-h-24 w-full resize-y rounded-md border bg-surface px-3 py-2 text-base text-fg shadow-xs transition-colors',
        'placeholder:text-fg-subtle',
        'hover:border-border-strong',
        'focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-subtle disabled:opacity-60',
        isInvalid
          ? 'border-danger focus-visible:border-danger focus-visible:ring-danger/25'
          : 'border-border',
        className,
      )}
    />
  )
})
