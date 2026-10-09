import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AccountMenu } from '@/app/AccountMenu'
import { ThemeButton } from '@/app/ThemeButton'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { Brand } from '@/shared/components/Brand'

/** O titulo da aba de cada tela de fora do projeto. */
const TITULOS: Record<string, string> = {
  '/projects': 'Projetos',
  '/profile': 'Perfil',
  '/invite': 'Convite',
}

/**
 * Fora do projeto, so a barra de cima: nao ha o que navegar nesse nivel, e uma
 * lateral vazia so anunciaria que falta alguma coisa.
 *
 * **A marca leva aos projetos.** No Perfil e no convite ela era um texto parado, e
 * a unica volta era o botao do navegador — que no celular nem sempre esta a vista.
 */
export function AccountShell() {
  const { pathname } = useLocation()

  useEffect(() => {
    const titulo = TITULOS[pathname]
    if (titulo) document.title = titulo
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex h-14 flex-none items-center justify-between border-border border-b bg-surface-raised px-4 sm:px-8">
        <Link to="/projects" title="Ir para os projetos" className="rounded-md">
          <Brand />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeButton />
          <NotificationBell />
          <AccountMenu />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
