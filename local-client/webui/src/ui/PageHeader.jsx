import clsx from 'clsx'

// Cabeçalho de página: título, descrição, ações e trilha opcional.
// A trilha aceita um nó React ou uma lista de itens ({ label, href }).
function Breadcrumb({ items }) {
  const list = Array.isArray(items) ? items : [items]

  return (
    <nav aria-label="Trilha de navegação" className="text-xs text-fg-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {list.map((item, index) => {
          const isLast = index === list.length - 1
          const label = item && typeof item === 'object' && 'label' in item ? item.label : item
          const href = item && typeof item === 'object' ? item.href : undefined

          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && (
                <span aria-hidden="true" className="text-fg-muted">
                  /
                </span>
              )}
              {href && !isLast ? (
                <a href={href} className="rounded-sm text-fg-muted hover:text-fg">
                  {label}
                </a>
              ) : (
                <span className={isLast ? 'text-fg' : undefined} aria-current={isLast ? 'page' : undefined}>
                  {label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function PageHeader({ title, description, actions, breadcrumb, className }) {
  return (
    <header className={clsx('flex flex-col gap-3', className)}>
      {breadcrumb ? <Breadcrumb items={breadcrumb} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {description ? <p className="mt-1 text-base text-fg-muted">{description}</p> : null}
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
