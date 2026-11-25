import { useRef } from 'react'
import clsx from 'clsx'
import { Input } from './Input'

function SearchIcon() {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

/**
 * Campo de busca com lupa e botão de limpar. O `onChange` recebe o evento
 * (mesmo contrato do Input); o botão limpar emite um evento com valor vazio,
 * então `(e) => setBusca(e.target.value)` funciona sem tratamento extra.
 */
export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Buscar...',
  className,
  ...props
}) {
  const inputRef = useRef(null)
  const hasValue = value != null && String(value).length > 0

  const clear = () => {
    if (onClear) onClear()
    else onChange?.({ target: { value: '' }, currentTarget: { value: '' } })
    inputRef.current?.focus()
  }

  const handleKeyDown = (event) => {
    props.onKeyDown?.(event)
    if (event.defaultPrevented) return
    if (event.key === 'Escape' && hasValue) {
      event.preventDefault()
      clear()
    }
  }

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      leadingIcon={<SearchIcon />}
      trailing={
        hasValue ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpar busca"
            title="Limpar busca"
            className={clsx(
              'flex size-6 items-center justify-center rounded-sm text-fg-subtle transition-colors',
              'hover:bg-surface-2 hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25',
            )}
          >
            <ClearIcon />
          </button>
        ) : null
      }
      className={className}
    />
  )
}
