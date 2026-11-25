import { isValidElement } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import clsx from 'clsx'

// Tooltip com Provider embutido para funcionar sozinho em qualquer página.
// O gatilho precisa ser um elemento que aceite ref; texto puro é embrulhado
// num span automaticamente.
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 200,
  className,
  ...props
}) {
  if (!content) return children

  const trigger = isValidElement(children) ? children : <span>{children}</span>

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className={clsx(
              'z-50 max-w-xs rounded-md bg-fg px-2 py-1 text-xs text-bg shadow-md',
              className,
            )}
            {...props}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-fg" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
