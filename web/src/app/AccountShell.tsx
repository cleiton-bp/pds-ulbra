import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AccountMenu } from '@/app/AccountMenu'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { ProfileDialog } from '@/features/profile/ProfileDialog'
import { Brand } from '@/shared/components/Brand'
import { ThemeButton } from '@/shared/components/ThemeButton'

/** O titulo da aba de cada tela de fora do projeto. */
const TITULOS: Record<string, string> = {
  '/projects': 'Projetos',
  '/invite': 'Convite',
}

/**
 * Fora do projeto, so a barra de cima: nao ha o que navegar nesse nivel, e uma
 * lateral vazia so anunciaria que falta alguma coisa.
 *
 * **A marca leva aos projetos.** No convite ela era um texto parado, e a unica
 * volta era o botao do navegador — que no celular nem sempre esta a vista.
 *
 * O perfil nao e tela desta casca: e o dialogo montado aqui (e na casca do projeto),
 * aberto pelo menu da conta e pelo sino sobre a tela em que a pessoa esta.
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
          <ProfileDialog />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
