import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import clsx from 'clsx'

// Notificações efêmeras: ToastProvider envolve a aplicação e useToast() expõe
// toast({ title, description, tone }). Cada toast se fecha sozinho (4s por
// padrão) e também pelo botão X ou gesto de swipe.
const DEFAULT_DURATION = 4000

const TONE_DOTS = {
  neutral: 'bg-fg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

const ToastContext = createContext(null)

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

export function ToastProvider({ children, duration = DEFAULT_DURATION, swipeDirection = 'right' }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (input = {}) => {
      const payload = typeof input === 'string' ? { title: input } : input
      nextId.current += 1
      const id = nextId.current

      setToasts((current) => [
        ...current,
        {
          id,
          title: payload.title,
          description: payload.description,
          tone: payload.tone || 'neutral',
          duration: payload.duration ?? duration,
        },
      ])

      return id
    },
    [duration],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider duration={duration} swipeDirection={swipeDirection} label="Notificação">
        {children}

        {toasts.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            open
            duration={item.duration}
            onOpenChange={(open) => {
              if (!open) dismiss(item.id)
            }}
            className={clsx(
              'flex items-start gap-3 rounded-lg border border-border bg-elevated p-3 shadow-lg',
              'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
              'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform',
              'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
            )}
          >
            <span
              aria-hidden="true"
              className={clsx('mt-1 h-2 w-2 shrink-0 rounded-full', TONE_DOTS[item.tone] || TONE_DOTS.neutral)}
            />

            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-medium text-fg">
                {item.title || 'Notificação'}
              </ToastPrimitive.Title>
              {item.description ? (
                <ToastPrimitive.Description className="mt-0.5 text-xs text-fg-muted">
                  {item.description}
                </ToastPrimitive.Description>
              ) : null}
            </div>

            <ToastPrimitive.Close
              aria-label="Fechar notificação"
              className="inline-flex h-control-sm w-control-sm shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <CloseIcon />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}

        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-50 flex w-[calc(100vw_-_2rem)] max-w-sm flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast deve ser usado dentro de um <ToastProvider>')
  }

  return context
}
