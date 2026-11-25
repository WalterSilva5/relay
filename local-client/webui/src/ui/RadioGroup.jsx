import { useId } from 'react'
import clsx from 'clsx'
import { useField } from './Field'

/**
 * Grupo de opções exclusivas. Usa inputs `radio` nativos (Radix não tem
 * radio-group instalado), então a navegação por setas, o foco e a semântica
 * vêm do próprio navegador.
 */
export function RadioGroup({
  options = [],
  value,
  onValueChange,
  name,
  disabled = false,
  ariaLabel,
  className,
}) {
  const autoId = useId()
  const baseId = `relay-radio-${autoId.replace(/:/g, '')}`
  const groupName = name || baseId
  const field = useField()
  const isInvalid = field?.invalid ?? false

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : field?.labelId}
      aria-describedby={field?.describedBy}
      className={clsx('flex flex-col gap-2', className)}
    >
      {options.map((option, index) => {
        const opt = typeof option === 'string' ? { value: option, label: option } : option
        const isDisabled = disabled || opt.disabled
        const isChecked = value != null && String(value) === String(opt.value)
        const inputId = `${baseId}-${index}`
        const descriptionId = opt.description ? `${inputId}-description` : undefined
        const describedBy = [descriptionId, field?.describedBy].filter(Boolean).join(' ') || undefined

        return (
          <label
            key={String(opt.value)}
            htmlFor={inputId}
            className={clsx(
              'flex items-start gap-2.5',
              isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            )}
          >
            <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
              <input
                id={inputId}
                type="radio"
                name={groupName}
                value={opt.value}
                checked={isChecked}
                onChange={() => onValueChange?.(opt.value)}
                disabled={isDisabled}
                aria-invalid={isInvalid || undefined}
                aria-describedby={describedBy}
                className={clsx(
                  'peer size-4 appearance-none rounded-full border bg-surface shadow-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25',
                  'checked:border-accent checked:bg-accent',
                  isDisabled ? 'cursor-not-allowed' : 'hover:border-accent',
                  isInvalid ? 'border-danger' : 'border-border-strong',
                )}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-contrast opacity-0 transition-opacity peer-checked:opacity-100"
              />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-fg">{opt.label}</span>
              {opt.description && (
                <span id={descriptionId} className="text-xs text-fg-muted">
                  {opt.description}
                </span>
              )}
            </span>
          </label>
        )
      })}
    </div>
  )
}
