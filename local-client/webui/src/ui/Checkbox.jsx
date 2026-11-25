import { useId } from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import clsx from 'clsx'
import { useField } from './Field'

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/**
 * Caixa de seleção (Radix) com rótulo e descrição opcionais. O clique no
 * texto também alterna, e o foco por teclado desenha o anel de foco.
 */
export function Checkbox({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  id,
  name,
  value,
  className,
}) {
  const autoId = useId()
  const field = useField()
  const boxId = id ?? field?.id ?? `relay-checkbox-${autoId.replace(/:/g, '')}`

  const control = (
    <CheckboxPrimitive.Root
      id={boxId}
      name={name}
      value={value}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-describedby={field?.describedBy}
      className={clsx(
        'flex size-4 shrink-0 items-center justify-center rounded-sm border bg-surface text-accent-contrast shadow-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'data-[state=unchecked]:border-border-strong data-[state=unchecked]:hover:border-accent',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )

  if (!label && !description) return control

  return (
    <label
      htmlFor={boxId}
      className={clsx(
        'flex items-start gap-2.5',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <span className="pt-0.5">{control}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        {label && <span className="text-sm text-fg">{label}</span>}
        {description && <span className="text-xs text-fg-muted">{description}</span>}
      </span>
    </label>
  )
}
