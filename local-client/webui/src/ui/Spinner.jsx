import clsx from 'clsx'

// Indicador de carregamento em SVG: herda a cor do texto (currentColor) e
// aceita apenas a escala fechada de tamanhos da interface.
const SIZES = {
  xs: 'size-3',
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-5',
  xl: 'size-6',
}

export function Spinner({ size = 'md', className, label, ...props }) {
  const decorative = !label

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={clsx('animate-spin', SIZES[size] || SIZES.md, className)}
      role={decorative ? undefined : 'status'}
      aria-label={label}
      aria-hidden={decorative ? true : undefined}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        className="opacity-25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
