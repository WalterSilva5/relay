import clsx from 'clsx'
import { Button } from './Button.jsx'
import { Dialog } from './Dialog.jsx'

// Diálogo de confirmação sobre o Dialog base. `onConfirm` só dispara a ação:
// quem chama decide se fecha (open/onOpenChange) e controla o `loading`.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  onConfirm,
  loading = false,
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" disabled={loading} onClick={() => onOpenChange?.(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={() => onConfirm?.()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
