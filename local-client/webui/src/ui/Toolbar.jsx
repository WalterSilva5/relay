import clsx from 'clsx'

// Faixa de filtros/ações acima de listas. No mobile empilha; a partir de sm
// vira uma linha com os controles à esquerda e as ações à direita.
export function Toolbar({ children, actions, className }) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-2 rounded-lg border border-border bg-surface p-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">{children}</div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:flex-1 sm:justify-end">{actions}</div>
      ) : null}
    </div>
  )
}
