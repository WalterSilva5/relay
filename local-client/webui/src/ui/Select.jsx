import { useId } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import clsx from 'clsx'
import { useField } from './Field'
import { splitWidthClasses } from './utils.js'

const HEIGHTS = {
  sm: 'h-control-sm',
  md: 'h-control',
  lg: 'h-control-lg',
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/**
 * Seleção única (Radix Select). A lista abre em portal, fecha com Escape,
 * percorre com setas/Home/End, busca por digitação e confirma com Enter —
 * tudo delegado ao Radix, que também mantém o foco no gatilho ao fechar.
 */
export function Select({
  value,
  onValueChange,
  options = [],
  placeholder,
  size = 'md',
  invalid,
  disabled = false,
  ariaLabel,
  name,
  id,
  className,
  contentClassName,
}) {
  const autoId = useId()
  const field = useField()
  const selectId = id ?? field?.id ?? `relay-select-${autoId.replace(/:/g, '')}`
  const isInvalid = invalid ?? field?.invalid ?? false
  const { widths, rest } = splitWidthClasses(className)

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      name={name}
      disabled={disabled}
    >
      <div className={clsx(widths.length ? widths : 'w-full')}>
      <SelectPrimitive.Trigger
        id={selectId}
        aria-label={ariaLabel}
        aria-invalid={isInvalid || undefined}
        aria-describedby={field?.describedBy}
        className={clsx(
          'flex w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-surface px-3 text-left text-base text-fg shadow-xs transition-colors',
          'data-[placeholder]:text-fg-subtle',
          'hover:border-border-strong',
          'focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25',
          'data-[state=open]:border-accent',
          'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-subtle disabled:opacity-60',
          HEIGHTS[size] || HEIGHTS.md,
          isInvalid
            ? 'border-danger focus-visible:border-danger focus-visible:ring-danger/25'
            : 'border-border',
          rest,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="min-w-0 flex-1 truncate text-left" />
        <SelectPrimitive.Icon className="shrink-0 text-fg-subtle">
          <ChevronDownIcon />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      </div>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          align="start"
          sideOffset={4}
          className={clsx(
            'z-50 flex max-h-72 min-w-[var(--radix-select-trigger-width)] flex-col overflow-hidden rounded-md border border-border bg-elevated text-fg shadow-md',
            contentClassName,
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 shrink-0 items-center justify-center text-fg-subtle">
            <ChevronUpIcon />
          </SelectPrimitive.ScrollUpButton>

          <SelectPrimitive.Viewport className="overflow-y-auto p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={String(option.value)}
                value={option.value}
                disabled={option.disabled}
                className={clsx(
                  'relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-7 pr-2 text-base text-fg outline-none',
                  'data-[highlighted]:bg-accent-soft',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                )}
              >
                <span className="absolute left-2 flex size-4 items-center justify-center text-accent">
                  <SelectPrimitive.ItemIndicator>
                    <CheckIcon />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>

          <SelectPrimitive.ScrollDownButton className="flex h-6 shrink-0 items-center justify-center text-fg-subtle">
            <ChevronDownIcon />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
