import * as Menu from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * Radix: setas, `Esc`, foco de volta no gatilho. Serve aos dois menus do design —
 * o do avatar e o seletor de projeto — que so mudam de conteudo.
 */
export function DropdownMenu({
  trigger,
  children,
  width = 'w-64',
  align = 'end',
}: {
  trigger: ReactNode
  children: ReactNode
  width?: string
  align?: 'start' | 'end'
}) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align={align}
          sideOffset={6}
          className={cn(
            'z-dialog overflow-hidden rounded-xl border border-border bg-surface-raised',
            width,
          )}
        >
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** Bloco de identificacao no topo do menu. Nao e clicavel. */
export function DropdownHeader({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3.5">{children}</div>
}

export function DropdownGroup({ children }: { children: ReactNode }) {
  return <div className="p-1.5">{children}</div>
}

export function DropdownItem({
  onSelect,
  quiet = false,
  children,
}: {
  onSelect: () => void
  /** Acao secundaria: texto menor e mais apagado, como no design. */
  quiet?: boolean
  children: ReactNode
}) {
  return (
    <Menu.Item
      onSelect={onSelect}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none',
        'data-[highlighted]:bg-surface-sunken',
        quiet ? 'text-detail text-fg-muted data-[highlighted]:text-fg' : 'text-fg text-body',
      )}
    >
      {children}
    </Menu.Item>
  )
}

export function DropdownSeparator() {
  return <Menu.Separator className="h-px bg-border" />
}
