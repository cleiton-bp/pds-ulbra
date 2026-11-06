import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AccountMenu } from '@/app/AccountMenu'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { ProfileDialog } from '@/features/profile/ProfileDialog'
import { Brand } from '@/shared/components/Brand'
import { ThemeButton } from '@/shared/components/ThemeButton'
import { GuideButton } from '@/shared/tour/GuideButton'
import { guideTarget } from '@/shared/tour/guideStore'

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
      {/* Como a barra da casca do projeto: abaixo de 400 as margens e os espacos encolhem,
          e a marca tem area de toque maior sem mudar o desenho. */}
      <header className="flex h-14 flex-none items-center justify-between gap-2 border-border border-b bg-surface px-4 max-[400px]:px-3 sm:px-8">
        <Link
          to="/projects"
          title="Ir para os projetos"
          className="min-w-0 rounded-md pointer-coarse:-m-1.5 pointer-coarse:p-1.5"
        >
          <Brand />
        </Link>
        <div className="flex flex-none items-center gap-2 max-[400px]:gap-1.5">
          <GuideButton />
          <ThemeButton />
          <span {...guideTarget('avisos')} className="flex">
            <NotificationBell />
          </span>
          <span {...guideTarget('conta')} className="flex">
            <AccountMenu />
          </span>
          <ProfileDialog />
        </div>
      </header>

      {/* Folga no pe: o fim da tela sobe longe da borda da janela. */}
      <main className="flex-1 pb-24 lg:pb-32">
        {/* A tela nova entra esmaecendo ao trocar de endereco. */}
        <div key={pathname} className="animate-panel-in">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
