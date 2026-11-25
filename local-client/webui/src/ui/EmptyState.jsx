import clsx from 'clsx'

// Estado vazio centralizado: ícone opcional dentro de um selo, título,
// descrição curta e uma ação (em geral um Button).
export function EmptyState({ icon, title, description, action, className, ...props }) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="flex h-control-lg w-control-lg items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
          {icon}
        </div>
      ) : null}
      {title ? <h3 className="text-md font-semibold text-fg">{title}</h3> : null}
      {description ? <p className="max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
