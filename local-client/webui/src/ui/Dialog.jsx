import * as DialogPrimitive from '@radix-ui/react-dialog'
import clsx from 'clsx'

// Diálogo modal sobre o Radix: overlay escurecido, conteúdo elevado, foco preso
// e fechamento por Esc/click fora. O título vira o nome acessível do diálogo e a
// descrição é ligada automaticamente ao aria-describedby pelo Radix.
const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-fg/40 backdrop-blur-sm" />

        <DialogPrimitive.Content
          aria-label={title ? undefined : 'Diálogo'}
          className={clsx(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh_-_4rem)] w-[calc(100vw_-_2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-elevated p-5 shadow-lg',
            SIZES[size] || SIZES.md,
            className,
          )}
        >
          <div className="flex flex-col gap-1 pr-8">
            {title ? (
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-fg">
                {title}
              </DialogPrimitive.Title>
            ) : null}
            {description ? (
              <DialogPrimitive.Description className="text-sm text-fg-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>

          <DialogPrimitive.Close
            aria-label="Fechar"
            className="absolute right-3 top-3 inline-flex h-control-sm w-control-sm items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <CloseIcon />
          </DialogPrimitive.Close>

          {children ? <div className="min-w-0 text-sm text-fg">{children}</div> : null}

          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">{footer}</div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
