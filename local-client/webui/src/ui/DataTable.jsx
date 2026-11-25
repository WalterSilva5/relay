import clsx from 'clsx'
import { Skeleton } from './Skeleton.jsx'

const ALIGN = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

const CELL_PADDING = {
  dense: 'px-3 py-1.5',
  normal: 'px-3 py-2.5',
}

function resolveRowKey(rowKey, row, index) {
  if (typeof rowKey === 'function') return rowKey(row, index)
  if (typeof rowKey === 'string') return row[rowKey]
  return row?.id ?? index
}

// Colunas ocultas no mobile usam a classe sm:table-cell: a célula continua no
// DOM (leitor de tela e layout de desktop), só não ocupa espaço no mobile.
function columnVisibility(column) {
  return column.hideOnMobile ? 'hidden sm:table-cell' : undefined
}

function ariaSortFor(column, sort) {
  if (!column.sortable) return undefined
  if (!sort || sort.key !== column.key) return 'none'
  return sort.direction === 'desc' ? 'descending' : 'ascending'
}

function nextSort(current, key) {
  if (!current || current.key !== key) return { key, direction: 'asc' }
  if (current.direction === 'asc') return { key, direction: 'desc' }
  return null
}

function SortIndicator({ state }) {
  return (
    <span aria-hidden="true" className="text-xs text-fg-muted">
      {state === 'ascending' ? '↑' : state === 'descending' ? '↓' : '↕'}
    </span>
  )
}

export function DataTable({
  columns = [],
  rows = [],
  rowKey,
  onRowClick,
  empty,
  loading = false,
  dense = false,
  sort,
  onSortChange,
  className,
  caption,
}) {
  const padding = dense ? CELL_PADDING.dense : CELL_PADDING.normal
  const emptyContent = empty ?? 'Nenhum registro encontrado.'
  const skeletonRows = 5

  return (
    <div className={clsx('w-full overflow-x-auto rounded-lg border border-border bg-surface', className)}>
      <table className="w-full min-w-full border-collapse text-left text-sm text-fg">
        {caption ? <caption className="px-3 py-2 text-left text-xs text-fg-muted">{caption}</caption> : null}

        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr>
            {columns.map((column) => {
              const sortState = ariaSortFor(column, sort)
              const sortable = Boolean(column.sortable)
              const canSort = sortable && typeof onSortChange === 'function'

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={sortState}
                  className={clsx(
                    'sticky top-0 z-10 border-b border-border bg-surface-2 text-xs font-medium uppercase tracking-wide text-fg-muted',
                    padding,
                    ALIGN[column.align] || ALIGN.left,
                    columnVisibility(column),
                    column.width,
                  )}
                >
                  {canSort ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(nextSort(sort, column.key), column)}
                      className={clsx(
                        'inline-flex items-center gap-1 rounded-sm uppercase tracking-wide text-fg-muted hover:text-fg',
                        column.align === 'right' && 'justify-end',
                      )}
                    >
                      {column.header}
                      <SortIndicator state={sortState} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="border-b border-border last:border-b-0">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={clsx(padding, ALIGN[column.align] || ALIGN.left, columnVisibility(column))}
                    >
                      <Skeleton
                        h="h-3"
                        w={column.align === 'right' ? 'w-16' : 'w-full'}
                        className={column.align === 'right' ? 'ml-auto' : undefined}
                      />
                    </td>
                  ))}
                </tr>
              ))
            : rows.length === 0
              ? (
                  <tr>
                    <td
                      colSpan={Math.max(columns.length, 1)}
                      className="px-3 py-10 text-center text-sm text-fg-muted"
                    >
                      {emptyContent}
                    </td>
                  </tr>
                )
              : rows.map((row, index) => {
                  const clickable = typeof onRowClick === 'function'

                  return (
                    <tr
                      key={resolveRowKey(rowKey, row, index)}
                      onClick={clickable ? () => onRowClick(row, index) : undefined}
                      onKeyDown={
                        clickable
                          ? (event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                onRowClick(row, index)
                              }
                            }
                          : undefined
                      }
                      tabIndex={clickable ? 0 : undefined}
                      className={clsx(
                        'border-b border-border last:border-b-0',
                        clickable && 'cursor-pointer hover:bg-surface-2',
                      )}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={clsx(
                            padding,
                            ALIGN[column.align] || ALIGN.left,
                            columnVisibility(column),
                          )}
                        >
                          {column.render ? column.render(row, index) : row[column.key]}
                        </td>
                      ))}
                    </tr>
                  )
                })}
        </tbody>
      </table>
    </div>
  )
}
