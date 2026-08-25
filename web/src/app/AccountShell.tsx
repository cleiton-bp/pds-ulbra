import { Outlet } from 'react-router-dom'
import { AccountMenu } from '@/app/AccountMenu'
import { ThemeButton } from '@/app/ThemeButton'
import { Brand } from '@/shared/components/Brand'

/**
 * Fora do projeto, so a barra de cima: nao ha o que navegar nesse nivel, e uma
 * lateral vazia so anunciaria que falta alguma coisa.
 */
export function AccountShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex h-14 flex-none items-center justify-between border-border border-b bg-surface-raised px-8">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeButton />
          <AccountMenu />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
