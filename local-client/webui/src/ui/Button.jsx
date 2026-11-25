import { cva } from 'class-variance-authority'
import clsx from 'clsx'
import { Spinner } from './Spinner.jsx'

// Botão base da interface. `as` troca o elemento renderizado (por exemplo um
// link do router) mantendo o visual; fora de um <button> o estado inativo é
// aplicado por aria-disabled e o clique é bloqueado no handler.
const button = cva(
  [
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md border font-medium',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-accent text-accent-contrast shadow-xs hover:bg-accent-hover',
        secondary: 'border-border-strong bg-surface text-fg shadow-xs hover:bg-surface-2',
        ghost: 'border-transparent bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
        danger: 'border-transparent bg-danger text-accent-contrast shadow-xs hover:bg-danger/90',
        link: 'border-transparent bg-transparent text-accent hover:underline hover:underline-offset-2',
      },
      size: {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-md',
      },
      iconOnly: {
        true: 'aspect-square',
        false: null,
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      iconOnly: false,
    },
  },
)

// Altura e respiro lateral ficam fora do CVA para não competir com as
// variantes `link` (sem caixa) e `iconOnly` (quadrado, sem padding).
const HEIGHTS = {
  sm: 'h-control-sm',
  md: 'h-control',
  lg: 'h-control-lg',
}

const PADDINGS = {
  sm: 'px-2.5',
  md: 'px-3',
  lg: 'px-4',
}

const SPINNER_SIZES = {
  sm: 'xs',
  md: 'sm',
  lg: 'md',
}

export function Button({
  as: Comp = 'button',
  variant = 'primary',
  size = 'md',
  iconOnly = false,
  loading = false,
  disabled = false,
  type,
  className,
  children,
  onClick,
  ...props
}) {
  const isButton = Comp === 'button'
  const inactive = disabled || loading

  const handleClick = (event) => {
    if (inactive) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <Comp
      {...props}
      type={isButton ? type || 'button' : undefined}
      className={clsx(
        button({ variant, size, iconOnly }),
        variant === 'link' ? 'h-auto px-0' : HEIGHTS[size],
        variant !== 'link' && (iconOnly ? 'px-0' : PADDINGS[size]),
        !isButton && inactive && 'pointer-events-none opacity-50',
        className,
      )}
      disabled={isButton ? inactive : undefined}
      aria-disabled={!isButton && inactive ? true : undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
    >
      {loading ? <Spinner size={SPINNER_SIZES[size]} /> : null}
      {iconOnly && loading ? null : children}
    </Comp>
  )
}
