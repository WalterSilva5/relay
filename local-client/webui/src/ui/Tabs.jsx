import * as TabsPrimitive from '@radix-ui/react-tabs'
import clsx from 'clsx'
import { Badge } from './Badge.jsx'

// Abas com indicador (underline) no item ativo, sobre o Radix Tabs — o Radix
// garante navegação por teclado (setas/Home/End) e aria-selected na tablist.
export function Tabs({ tabs = [], value, onValueChange, children, ariaLabel = 'Abas', className }) {
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      className={clsx('flex flex-col gap-4', className)}
    >
      <TabsPrimitive.List
        aria-label={ariaLabel}
        className="flex flex-wrap items-center gap-1 border-b border-border"
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className={clsx(
              'inline-flex h-control -mb-px items-center gap-1.5 whitespace-nowrap rounded-t-sm border-b-2 border-transparent px-3 text-sm font-medium text-fg-muted transition-colors',
              'hover:text-fg',
              'data-[state=active]:border-accent data-[state=active]:text-fg',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {tab.icon ? <span aria-hidden="true" className="shrink-0">{tab.icon}</span> : null}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null ? (
              <Badge variant={tab.badgeVariant || tab.badgeTone || 'neutral'} size="sm">
                {tab.badge}
              </Badge>
            ) : null}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      {children}

      {tabs.map((tab) =>
        tab.content ? (
          <TabsPrimitive.Content key={tab.value} value={tab.value} className="outline-none">
            {tab.content}
          </TabsPrimitive.Content>
        ) : null,
      )}
    </TabsPrimitive.Root>
  )
}
