import { useEffect, useState } from 'react'
import clsx from 'clsx'

// Paleta fechada: a cor de fundo é derivada do nome, sempre com o par
// soft/forte dos tokens semânticos.
const PALETTE = [
  'bg-accent-soft text-accent',
  'bg-accent-soft-2 text-accent',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
  'bg-danger-soft text-danger',
  'bg-surface-2 text-fg-muted',
]

const SIZES = {
  sm: 'h-control-sm w-control-sm text-xs',
  md: 'h-control w-control text-sm',
  lg: 'h-control-lg w-control-lg text-md',
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0].charAt(0)
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return `${first}${last}`.toUpperCase()
}

function toneOf(name) {
  const text = String(name || '')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 997
  }
  return PALETTE[hash % PALETTE.length]
}

export function Avatar({ name = '', src, size = 'md', title, className, ...props }) {
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setBroken(false)
  }, [src])

  const showImage = Boolean(src) && !broken

  return (
    <span
      title={title ?? (name || undefined)}
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold',
        SIZES[size] || SIZES.md,
        !showImage && toneOf(name),
        className,
      )}
      {...props}
    >
      {showImage ? (
        <img
          src={src}
          alt={name || ''}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  )
}
