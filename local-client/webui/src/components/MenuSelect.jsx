import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { t } from '../i18n'

// Seletor do menu (workspace/projeto) — Tailwind puro, mesma API de antes.
export default function MenuSelect({
  label, value, options = [], onChange, placeholder,
  onCreate, createTitle, searchable = true, emptyHint, icon,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false) }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  useEffect(() => { if (!open) setQuery('') }, [open])

  const current = options.find((o) => String(o.value) === String(value))
  const term = query.trim().toLowerCase()
  const list = term
    ? options.filter((o) => `${o.label} ${o.hint || ''}`.toLowerCase().includes(term))
    : options

  const choose = (v) => {
    setOpen(false)
    if (String(v) !== String(value)) onChange(v)
  }

  return (
    <div className="relative" ref={root}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{label}</span>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            title={createTitle}
            aria-label={createTitle || t('Criar')}
            className="grid size-6 place-items-center rounded-sm border border-border-strong bg-surface text-fg-muted shadow-xs transition hover:border-accent hover:bg-accent-soft hover:text-accent"
          >
            <Icon name="plus" size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex min-h-control-lg w-full items-center gap-2.5 rounded-md border bg-surface px-2.5 py-1.5 text-left shadow-xs transition
          ${open ? 'border-accent ring-2 ring-accent/20' : 'border-border-strong hover:border-accent/60 hover:shadow-sm'}`}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent">
          {icon ? <Icon name={icon} size={15} /> : current?.badge
            ? <span className="text-[10px] font-bold tracking-wide">{current.badge}</span>
            : <Icon name="layers" size={15} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${current ? 'font-semibold text-fg' : 'font-medium text-fg-muted'}`}>
            {current?.label || placeholder || t('Selecione')}
          </span>
          {current?.hint && <span className="block truncate text-xs text-fg-muted">{current.hint}</span>}
        </span>
        <Icon name="chevronLeft" size={13} className="-rotate-90 text-fg-subtle" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 rounded-md border border-border bg-elevated p-1.5 shadow-lg"
        >
          {searchable && options.length > 5 && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Buscar...')}
              className="mb-1 h-control-sm w-full rounded-sm border border-border bg-bg px-2 text-xs text-fg placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none"
            />
          )}
          <div className="max-h-80 overflow-y-auto">
            {list.map((o) => {
              const active = String(o.value) === String(value)
              return (
                <button
                  type="button"
                  key={o.value}
                  role="option"
                  aria-selected={active}
                  onClick={() => choose(o.value)}
                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition
                    ${active ? 'bg-accent-soft text-accent' : 'text-fg hover:bg-surface-2'}`}
                >
                  {o.badge && (
                    <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent">
                      {o.badge}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${active ? 'font-semibold' : ''}`}>{o.label}</span>
                    {o.hint && <span className="block truncate text-xs text-fg-muted">{o.hint}</span>}
                  </span>
                  {active && <Icon name="check" size={14} />}
                </button>
              )
            })}
            {list.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-fg-muted">
                {emptyHint || t('Nada encontrado')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
