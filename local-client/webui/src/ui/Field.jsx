import { cloneElement, createContext, isValidElement, useContext, useId } from 'react'
import clsx from 'clsx'

/**
 * Contexto que liga o rótulo do Field ao controle renderizado dentro dele.
 * Os primitivos (Input, Textarea, Select, Checkbox, Switch, RadioGroup) leem
 * esse contexto para herdar `id`, `aria-describedby` e o estado de erro.
 */
const FieldContext = createContext(null)

export function useField() {
  return useContext(FieldContext)
}

function counterText(counter) {
  if (counter == null) return null
  if (typeof counter === 'number' || typeof counter === 'string') return String(counter)
  const current = counter.current ?? counter.value ?? 0
  return counter.max == null ? String(current) : `${current}/${counter.max}`
}

function counterOverflow(counter) {
  if (!counter || typeof counter !== 'object') return false
  const current = Number(counter.current ?? counter.value ?? 0)
  return counter.max != null && current > Number(counter.max)
}

/**
 * Campo de formulário: rótulo, dica, erro e contador em volta do controle.
 * O `<label>` aponta para o `id` do controle (via `htmlFor` ou pelo contexto).
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  counter,
  children,
  htmlFor,
  className,
}) {
  const autoId = useId()
  const childId =
    isValidElement(children) && typeof children.type === 'string' ? children.props.id : undefined
  const id = htmlFor || childId || `relay-field-${autoId.replace(/:/g, '')}`
  const labelId = label ? `${id}-label` : undefined
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = error ? errorId : hintId
  const invalid = Boolean(error)
  const count = counterText(counter)

  // Controles nativos passados direto como filho também recebem o vínculo.
  let content = children
  if (isValidElement(children) && typeof children.type === 'string') {
    content = cloneElement(children, {
      id: children.props.id || id,
      'aria-describedby': children.props['aria-describedby'] || describedBy,
      'aria-invalid': children.props['aria-invalid'] ?? (invalid || undefined),
      'aria-required': children.props['aria-required'] ?? (required || undefined),
    })
  }

  return (
    <FieldContext.Provider value={{ id, labelId, describedBy, invalid, required }}>
      <div className={clsx('flex flex-col gap-1.5', className)}>
        {(label || count) && (
          <div className="flex items-baseline justify-between gap-2">
            {label ? (
              <label id={labelId} htmlFor={id} className="text-sm font-medium text-fg">
                {label}
                {required && (
                  <span className="text-danger" aria-hidden="true">
                    {' '}
                    *
                  </span>
                )}
              </label>
            ) : (
              <span />
            )}
            {count && (
              <span
                className={clsx(
                  'shrink-0 text-xs tabular-nums',
                  counterOverflow(counter) ? 'text-danger' : 'text-fg-muted',
                )}
              >
                {count}
              </span>
            )}
          </div>
        )}
        {content}
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-fg-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  )
}
