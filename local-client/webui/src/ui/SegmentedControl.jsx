import clsx from 'clsx'

// Controle segmentado (estilo iOS): trilho afundado e item ativo elevado.
const CONTAINER_SIZES = {
  sm: 'p-0.5',
  md: 'p-1',
  lg: 'p-1',
}

const ITEM_SIZES = {
  sm: 'h-control-sm px-2 text-xs',
  md: 'h-control px-3 text-sm',
  lg: 'h-control-lg px-3.5 text-md',
}

function normalize(option) {
  if (option && typeof option === 'object') return option
  return { value: option, label: option }
}

export function SegmentedControl({ options = [], value, onChange, size = 'md', ariaLabel = 'Seleção', className }) {
  const containerSize = CONTAINER_SIZES[size] || CONTAINER_SIZES.md
  const itemSize = ITEM_SIZES[size] || ITEM_SIZES.md

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={clsx('inline-flex max-w-full items-center gap-1 rounded-md bg-surface-2', containerSize, className)}
    >
      {options.map((raw) => {
        const option = normalize(raw)
        const active = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => onChange?.(option.value)}
            className={clsx(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
              itemSize,
              active ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.icon ? <span aria-hidden="true" className="shrink-0">{option.icon}</span> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
