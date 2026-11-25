import { useId } from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import clsx from 'clsx'
import { useField } from './Field'

/**
 * Interruptor de liga/desliga (Radix). Trilho compacto e bolinha que desliza;
 * o rótulo inteiro é clicável e o teclado alterna com Espaço/Enter.
 */
export function Switch({
  label,
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
  const switchId = id ?? field?.id ?? `relay-switch-${autoId.replace(/:/g, '')}`

  const control = (
    <SwitchPrimitive.Root
      id={switchId}
      name={name}
      value={value}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-describedby={field?.describedBy}
      className={clsx(
        'inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-accent data-[state=unchecked]:bg-border-strong',
        'data-[state=unchecked]:hover:bg-fg-subtle',
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={clsx(
          'block size-4 rounded-full bg-surface shadow-xs transition-transform',
          'data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-4',
        )}
      />
    </SwitchPrimitive.Root>
  )

  if (!label) return control

  return (
    <label
      htmlFor={switchId}
      className={clsx(
        'flex items-center justify-between gap-3',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <span className="text-sm text-fg">{label}</span>
      {control}
    </label>
  )
}
