import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router-dom'
import { AccountMenu } from '@/app/AccountMenu'
import type { ConfigAreaKey, ConsoleSection } from '@/app/navigation'
import {
  areaOfSection,
  CONFIG_AREAS,
  CONFIG_HOME,
  isConfigPath,
  isSectionActive,
  sectionByPath,
  WORK_SECTIONS,
} from '@/app/navigation'
import { ProjectSwitcher } from '@/app/ProjectSwitcher'
import { SectionIcon } from '@/app/SectionIcon'
import type { ProjectViewModel } from '@/contracts'
import { isPanelError } from '@/data'
import { useSessionStore } from '@/features/auth/sessionStore'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { ProfileDialog } from '@/features/profile/ProfileDialog'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Brand } from '@/shared/components/Brand'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { ThemeButton } from '@/shared/components/ThemeButton'
import { Tooltip } from '@/shared/components/Tooltip'
import type { ProjectContext } from '@/shared/hooks/useCurrentProject'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { useNeedsBottomRoom } from '@/shared/hooks/useNeedsBottomRoom'
import { useScrollToHash } from '@/shared/hooks/useScrollToHash'
import { cn } from '@/shared/lib/cn'
import { canConfigure } from '@/shared/lib/projectAccess'
import { rememberProjectOpened } from '@/shared/lib/recentProjects'
import { GuideButton } from '@/shared/tour/GuideButton'
import { guideTarget, useGuideStore } from '@/shared/tour/guideStore'

/**
 * Nao e um booleano `notFound`: "nao encontrado" e "nao deu para saber" pedem
 * acoes diferentes — conferir o endereco ou tentar de novo. Com um so, a frase
 * "ele nao existe ou voce nao esta nele" era dita tambem com a API fora do ar.
 */
type ProjectFailure = 'notFound' | 'failed'

/** A escolha de recolher a lateral no computador. Conveniencia de quem olha. */
const LATERAL_RECOLHIDA = 'pds.web.lateral.recolhida'

/**
 * A casca de dentro do projeto. O seletor do topo permite trocar de contexto sem
 * voltar ao hub — e o que faz isto parecer console, e nao paginas soltas. Em tela
 * estreita a lateral vira gaveta.
 *
 * **Trocar de projeto mantem a tela.** Quem esta no quadro de um projeto e troca
 * pelo seletor quer o quadro do outro, e nao a porta dele: o destino e a mesma
 * secao, se ela existir para o papel da pessoa no outro projeto.
 */
export function ProjectShell() {
  const { publicId = '' } = useParams()
  const location = useLocation()

  const projects = useProjectsStore((state) => state.projects)
  const load = useProjectsStore((state) => state.load)
  const loadOne = useProjectsStore((state) => state.loadOne)

  /**
   * O estado da **lista**, que nao e o do projeto aberto: com a listagem
   * falhando, o seletor mostrava so o projeto atual e uma conta com doze projetos
   * parecia ter um, sem erro e sem como tentar de novo.
   */
  const listStatus = useProjectsStore((state) => state.status)

  const [failure, setFailure] = useState<ProjectFailure | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(lerRecolhida)
  // **Recolher e abrir sao um movimento**, e nao um salto: a largura anda (300 ms) e
  // os nomes esmaecem. `compacto` e o desenho so de glifos, que troca **depois** de a
  // lateral fechar e **antes** de ela abrir — o glifo fica no mesmo lugar nos dois
  // desenhos, e a troca nao aparece. `rotulosOcultos` esmaece os nomes enquanto a
  // largura anda.
  const [compacto, setCompacto] = useState(collapsed)
  const [rotulosOcultos, setRotulosOcultos] = useState(false)
  // O recuo das telas embaixo de cada area tambem anda: sem isso, ao fechar, o fio do
  // recuo e os glifos recuados ficavam por cima da coluna dos glifos.
  const [recuoRecolhido, setRecuoRecolhido] = useState(false)
  const movimento = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(movimento.current), [])

  // O `#` do endereco leva ao campo, em qualquer tela do projeto: a busca da
  // configuracao, os primeiros passos e o sino apontam para `tela#campo`. Mora na
  // casca, e nao em cada tela, para a tela nova ganhar isso sem lembrar de pedir.
  useScrollToHash()

  const project = projects.find((item) => item.PublicId === publicId)

  // O "Abertos recentemente" do hub: so o projeto que a pessoa enxerga entra, e so
  // quando ele chega — o endereco digitado errado nao vira um recente.
  const userId = useSessionStore((state) => state.user?.PublicId)
  const abertoAgora = project?.PublicId
  useEffect(() => {
    if (userId && abertoAgora) rememberProjectOpened(userId, abertoAgora)
  }, [userId, abertoAgora])

  // `/projects/:id/<secao>/...`: a secao aberta, e se ela e o card aberto.
  const [, , , segment = '', resto] = location.pathname.split('/')
  const trabalho = segment === 'reports'
  const cardAberto = trabalho && Boolean(resto)

  // A folga grande do pe so quando a tela ja rola: ver `useNeedsBottomRoom`.
  const principal = useRef<HTMLElement>(null)
  const telaDaVez = useRef<HTMLDivElement>(null)
  const comFolgaNoPe = useNeedsBottomRoom(principal, telaDaVez, segment)

  // O projeto que a casca esta abrindo agora: a resposta que chega depois de a
  // pessoa ter ido para outro projeto nao pode marcar este como "nao encontrado".
  const current = useRef(publicId)
  current.current = publicId
  const opening = useRef(false)

  const openProject = useCallback(async () => {
    if (!publicId) return
    setFailure(null)

    if (!useProjectsStore.getState().projects.some((item) => item.PublicId === publicId)) {
      opening.current = true
      try {
        await loadOne(publicId)
      } catch (error) {
        if (current.current === publicId) {
          setFailure(isPanelError(error) && error.status === 404 ? 'notFound' : 'failed')
        }
        return
      } finally {
        opening.current = false
      }
    } else {
      // Ja estava na lista, e a lista envelhece: o papel muda, e a pessoa sai do
      // time. Abre na hora com o que se sabia e confere em segundo plano — quem
      // saiu ve "nao encontrado", e nao telas respondendo 404 uma a uma.
      loadOne(publicId).catch((error) => {
        if (current.current === publicId && isPanelError(error) && error.status === 404) {
          setFailure('notFound')
        }
      })
    }

    // A lista completa alimenta o seletor do topo. Tenta tambem depois de um erro
    // anterior: presa em `idle`, uma falha no hub deixava o seletor com um projeto
    // so, para sempre. Le do `getState()` porque precisa do valor **deste
    // instante** — o da renderizacao envelhece enquanto o `await` acima demora.
    const statusNow = useProjectsStore.getState().status
    if (statusNow !== 'ready' && statusNow !== 'loading') void load()
  }, [publicId, loadOne, load])

  useEffect(() => {
    void openProject()
  }, [openProject])

  // A lista recarregou sem o projeto aberto: a pessoa saiu do time, ou o projeto
  // sumiu. Sem isto, a tela ficava no esqueleto para sempre.
  useEffect(() => {
    if (failure || listStatus !== 'ready' || project || opening.current) return
    void openProject()
  }, [failure, listStatus, project, openProject])

  // O titulo da aba: "Colunas · Loja". Com dois projetos abertos em abas, ou um
  // card aberto para consulta, as abas iguais nao se distinguiam. O card aberto
  // escreve o proprio titulo — aqui ele fica com o da lista, que veio antes.
  const projectName = project?.Name
  useEffect(() => {
    if (!projectName || cardAberto) return
    const secao = sectionByPath(segment)
    document.title = secao ? `${secao.label} (${projectName})` : projectName
  }, [projectName, segment, cardAberto])

  // A gaveta e como um dialogo: o foco entra nela ao abrir, Esc fecha, e o foco
  // volta ao botao que abriu. Sem isto, quem usa teclado abria a gaveta e o
  // proximo Tab ia para o seletor do topo, atras do veu.
  const menuButton = useRef<HTMLButtonElement>(null)
  const nav = useRef<HTMLElement>(null)

  // O guia da tela, para o pe do menu do celular: abre pelo pedido, e o botao da barra (que
  // no celular fica escondido) atende.
  const temGuia = useGuideStore((estado) => estado.tela !== null && !estado.tela.noDialogo)
  // A largura de celular (abaixo do `sm`), acompanhando o giro: o pe da gaveta so existe la.
  const celular = useMediaQuery('(max-width: 39.99rem)')
  const pedirGuia = useGuideStore((estado) => estado.pedir)

  const fecharGaveta = useCallback((devolverFoco: boolean) => {
    setDrawerOpen(false)
    if (devolverFoco) menuButton.current?.focus()
  }, [])

  useEffect(() => {
    if (!drawerOpen) return

    const ativo =
      nav.current?.querySelector<HTMLElement>('[aria-current="page"]') ??
      nav.current?.querySelector<HTMLElement>('a, button')
    ativo?.focus()

    function aoTeclar(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        fecharGaveta(true)
        return
      }
      // O Tab circula dentro da gaveta, como num dialogo: depois do ultimo item, o foco ia
      // para a tela atras do veu, que nao se ve. Fica de fora o que esta escondido (o
      // recolher, que e so da lateral) e os grupos fechados (`inert`).
      if (event.key !== 'Tab' || !nav.current) return
      const itens = [...nav.current.querySelectorAll<HTMLElement>('a[href], button')].filter(
        (item) => item.getClientRects().length > 0 && !item.closest('[inert]'),
      )
      const primeiro = itens[0]
      const ultimo = itens.at(-1)
      if (!primeiro || !ultimo) return
      if (event.shiftKey && document.activeElement === primeiro) {
        event.preventDefault()
        ultimo.focus()
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [drawerOpen, fecharGaveta])

  function recolher(valor: boolean) {
    setCollapsed(valor)
    window.clearTimeout(movimento.current)
    if (semMovimento()) {
      setCompacto(valor)
      setRotulosOcultos(false)
      setRecuoRecolhido(false)
    } else if (valor) {
      // Fechar: os nomes esmaecem, o recuo das areas desliza para a coluna dos glifos
      // e a largura encolhe — tudo junto, em 300 ms. So no fim vira o desenho de glifos,
      // que tem tudo no mesmo lugar.
      setRotulosOcultos(true)
      setRecuoRecolhido(true)
      movimento.current = window.setTimeout(() => {
        setCompacto(true)
        setRotulosOcultos(false)
        setRecuoRecolhido(false)
      }, DURACAO_DA_LATERAL)
    } else {
      // Abrir: desenha com os nomes apagados e o recuo ainda na coluna dos glifos; no
      // quadro seguinte o recuo desliza para o lugar e os nomes aparecem, enquanto a
      // largura cresce.
      setCompacto(false)
      setRotulosOcultos(true)
      setRecuoRecolhido(true)
      movimento.current = window.setTimeout(() => {
        setRecuoRecolhido(false)
        movimento.current = window.setTimeout(() => setRotulosOcultos(false), 100)
      }, 20)
    }
    try {
      window.localStorage.setItem(LATERAL_RECOLHIDA, valor ? '1' : '0')
    } catch {
      // Sem onde guardar, a escolha vale ate fechar a aba.
    }
  }

  /** O mesmo lugar no outro projeto, se o papel da pessoa la deixar. */
  function destino(alvo: ProjectViewModel): string {
    const base = `/projects/${alvo.PublicId}`
    if (!sectionByPath(segment)) return base
    // A tela de configuracao do outro projeto e so de quem administra la; o card
    // aberto e deste projeto, e do outro so a lista faz sentido.
    if (isConfigPath(segment) && !canConfigure(alvo)) return `${base}/reports`
    return `${base}/${segment}`
  }

  // Sem o projeto, a casca continua de pe: marca, sino e conta no topo, e a falha
  // no lugar do conteudo. Antes a pagina perdia o topo inteiro.
  const header = (
    <header className="flex h-14 flex-none items-center justify-between gap-2 border-border border-b bg-surface pr-4 pl-4 max-[400px]:px-3 sm:pr-5 sm:pl-6">
      <div className="flex min-w-0 items-center gap-2.5 lg:gap-4">
        {!failure && (
          // Abre e fecha a gaveta, e o desenho vira um X com ela aberta: o caminho de volta fica
          // no mesmo lugar do de ida. No celular, sem caixa em volta, como os outros icones
          // da barra: cinco caixas lado a lado pesavam mais que o conteudo.
          <button
            ref={menuButton}
            type="button"
            onClick={() => (drawerOpen ? fecharGaveta(false) : setDrawerOpen(true))}
            aria-label={drawerOpen ? 'Fechar menu do projeto' : 'Abrir menu do projeto'}
            {...guideTarget('menu')}
            aria-expanded={drawerOpen}
            aria-controls="menu-do-projeto"
            className="flex size-8 flex-none items-center justify-center rounded-lg border border-border bg-surface-raised text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg pointer-coarse:size-10 max-sm:-ml-1.5 max-sm:border-transparent max-sm:bg-transparent lg:hidden"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              {/* As tres barras viram o X girando as de fora e apagando a do meio. */}
              <rect
                x="1"
                y="3"
                width="12"
                height="1.4"
                rx="0.7"
                className={cn(
                  'origin-center transition-transform duration-200 ease-out [transform-box:fill-box] motion-reduce:transition-none',
                  drawerOpen && 'translate-y-[3.3px] rotate-45',
                )}
              />
              <rect
                x="1"
                y="6.3"
                width="12"
                height="1.4"
                rx="0.7"
                className={cn(
                  'transition-opacity duration-150 motion-reduce:transition-none',
                  drawerOpen && 'opacity-0',
                )}
              />
              <rect
                x="1"
                y="9.6"
                width="12"
                height="1.4"
                rx="0.7"
                className={cn(
                  'origin-center transition-transform duration-200 ease-out [transform-box:fill-box] motion-reduce:transition-none',
                  drawerOpen && '-translate-y-[3.3px] -rotate-45',
                )}
              />
            </svg>
          </button>
        )}

        {/* A marca leva aos projetos. No celular ela sai da barra, e o caminho para os
            projetos fica no pe do menu ("Todos os projetos") e no seletor: a barra do
            celular mostra so onde a pessoa esta e o que ela mais usa. */}
        <Link
          to="/projects"
          title="Ir para os projetos"
          className="flex-none rounded-md pointer-coarse:-m-1.5 pointer-coarse:p-1.5 max-sm:hidden"
        >
          <Brand />
        </Link>
        <div className="hidden h-5 w-px flex-none bg-border lg:block" />

        {project ? (
          <ProjectSwitcher
            project={project}
            projects={projects}
            status={listStatus}
            userId={userId}
            destino={destino}
            aoTentarDeNovo={() => void load()}
          />
        ) : (
          !failure && <Skeleton className="h-8 w-40 min-w-0" />
        )}
      </div>

      <div className="flex flex-none items-center gap-2 max-sm:gap-1">
        <GuideButton noMenuDoCelular />
        {/* O tema so na barra do computador: no celular e no tablet ele esta no menu da
            conta, e a barra fica com o que se usa todo dia. */}
        <span className="hidden lg:contents">
          <ThemeButton />
        </span>
        <span {...guideTarget('avisos')} className="flex">
          <NotificationBell />
        </span>
        <span {...guideTarget('conta')} className="flex">
          <AccountMenu />
        </span>
        {/* O perfil abre por cima, sem trocar o endereco: menu da conta e sino. */}
        <ProfileDialog />
      </div>
    </header>
  )

  if (failure) {
    return (
      <div className="flex min-h-dvh flex-col bg-surface">
        {header}
        <main className="mx-auto w-full max-w-3xl px-6 py-20 text-center">
          <h1 className="font-semibold text-fg text-notice">
            {failure === 'notFound' ? 'Projeto não encontrado' : 'Não deu para abrir este projeto'}
          </h1>
          <p className="mt-1.5 text-fg-muted text-body">
            {failure === 'notFound'
              ? 'Ele não existe, ou você não está no time dele.'
              : 'A falha foi ao consultar, e não no projeto: nada mudou nele.'}
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            {failure === 'failed' && (
              <Button size="sm" onClick={() => void openProject()}>
                Tentar de novo
              </Button>
            )}
            <Link to="/projects" className="text-fg text-body underline">
              Voltar aos projetos
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const admin = project ? canConfigure(project) : false
  // Recolher so vale no computador: na gaveta do celular o nome sempre aparece.
  const iconesSo = compacto && !drawerOpen
  const estreita = collapsed && !drawerOpen

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface">
      {/* O primeiro foco da pagina: pelo teclado, eram vinte Tabs do topo ate o
          primeiro controle do Trabalho. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-tip focus:rounded-lg focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-body focus:text-fg"
      >
        Pular para o conteúdo
      </a>

      {header}

      <div className="relative flex min-h-0 flex-1">
        {drawerOpen && (
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => fecharGaveta(true)}
            className="absolute inset-0 z-drawer-veil bg-overlay lg:hidden"
          />
        )}

        {/* Rola sozinha: num celular pequeno ou deitado, a lista passava da altura
            da tela, e o que ficava embaixo era inalcancavel. */}
        <nav
          ref={nav}
          id="menu-do-projeto"
          aria-label="Seções do projeto"
          {...guideTarget('menu')}
          className={cn(
            // A lateral nao rola inteira: so a lista rola, e o recolher fica preso no pe.
            'flex flex-none flex-col overflow-hidden border-border border-r bg-surface',
            'transition-[width] duration-300 ease-out motion-reduce:transition-none',
            // Os nomes esmaecem enquanto a largura anda (ver `recolher`).
            '[&_[data-rotulo]]:transition-opacity [&_[data-rotulo]]:duration-150',
            rotulosOcultos && '[&_[data-rotulo]]:opacity-0',
            recuoRecolhido &&
              '[&_[data-recuo]]:ml-0 [&_[data-recuo]]:border-surface-raised [&_[data-recuo]]:pl-0',
            'absolute inset-y-0 left-0 z-drawer lg:static',
            // A margem dos lados mora dentro da lista e do pe, e nao aqui: na lateral,
            // a barra de rolagem ficaria dentro da margem, por cima dos itens. Assim
            // ela encosta na borda direita.
            estreita ? 'w-60 lg:w-14' : 'w-60',
            drawerOpen ? 'flex' : 'hidden lg:flex',
          )}
        >
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden py-5',
              'px-3',
            )}
          >
            <div className="flex flex-col gap-0.5">
              {WORK_SECTIONS.map((section) => (
                <SectionLink
                  key={section.key}
                  section={section}
                  segment={segment}
                  publicId={publicId}
                  iconOnly={iconesSo}
                  onNavigate={() => setDrawerOpen(false)}
                />
              ))}
            </div>

            {/* Quem e so membro nao ve a configuracao: ele trabalha nos relatos, e a
              API recusaria tudo o que ele tentasse mudar ali. Enquanto o projeto
              carrega, um esqueleto no lugar dela — o trabalho, em cima, nao pula. */}
            {!project ? (
              <div className="flex flex-col gap-2 px-2.5" aria-hidden>
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : (
              admin && (
                <ConfigNav
                  segment={segment}
                  publicId={publicId}
                  iconOnly={iconesSo}
                  onNavigate={() => setDrawerOpen(false)}
                />
              )
            )}
          </div>

          {/* Recolher, **preso no pe**: quem passa o dia no quadro ganha a largura da
              lateral. Com o grupo da configuracao aberto, a lista passa da altura da
              tela — e o botao, que rolava junto, sumia justo quando a lateral mais
              ocupava espaco. Agora so a lista de cima rola. A escolha fica guardada
              neste navegador. */}
          {/* So no celular: o guia da tela e os projetos, que sairam da barra de cima. */}
          {celular && (
            <div className="flex-none border-border border-t px-3 py-2 sm:hidden">
              {temGuia && (
                <SideButton
                  iconOnly={false}
                  label="Guia desta tela"
                  onClick={() => {
                    fecharGaveta(false)
                    pedirGuia()
                  }}
                  icon={<IconeDoGuia />}
                />
              )}
              <Link
                to="/projects"
                onClick={() => setDrawerOpen(false)}
                className="flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-detail text-fg-muted transition-colors hover:bg-surface-sunken focus-visible:-outline-offset-2 pointer-coarse:h-11"
              >
                <span className="flex size-3.5 flex-none items-center justify-center">
                  <Seta direcao="esquerda" />
                </span>
                <span className="min-w-0 flex-1 truncate">Todos os projetos</span>
              </Link>
            </div>
          )}
          <div className={cn('hidden flex-none border-border border-t py-2 lg:block', 'px-3')}>
            <SideButton
              iconOnly={iconesSo}
              label={collapsed ? 'Abrir o menu' : 'Recolher menu'}
              onClick={() => recolher(!collapsed)}
              icon={<Seta direcao={collapsed ? 'direita' : 'esquerda'} />}
            />
          </div>
        </nav>

        <main
          ref={principal}
          id="conteudo"
          tabIndex={-1}
          className={cn(
            'min-w-0 flex-1 overflow-auto px-5 pt-7 outline-none lg:px-10 lg:pt-10',
            // Com a volta presa no alto (`VoltarDeOndeVeio`), a ancora do endereco para logo
            // abaixo dela: sem a folga, a barra cobria o topo da secao (o cartao de
            // Visibilidade, vindo da Moderacao).
            'has-[[data-volta]]:scroll-pt-9',
            // Folga no pe: o fim da tela (o arquivar, o salvar) sobe longe da borda da
            // janela. O Trabalho mede a altura daqui, e cuida da folga dele na lista.
            // Nas outras, a folga grande so entra quando a tela ja rola; na tela que
            // cabe, o pe tem o mesmo respiro do topo, e a pagina nao rola para mostrar
            // espaco vazio.
            trabalho ? 'pb-7 lg:pb-12' : comFolgaNoPe ? 'pb-32 lg:pb-40' : 'pb-7 lg:pb-10',
          )}
        >
          {/* Tipado nas duas pontas: sem `satisfies` aqui, campo novo no contexto
              compila de um lado e chega `undefined` do outro. */}
          {/* A chave e a secao (trabalho, membros, moderacao...), e nao o endereco inteiro:
              abrir um card muda o endereco sem trocar de tela, e nao pode esmaecer a lista.
              `h-full` so no Trabalho, porque o quadro mede a altura a partir daqui. Nas
              outras telas a altura fixa fazia o texto passar por cima da folga do pe.
              Na tela grande a tela fica no meio da area: encostada a esquerda, sobrava
              metade da janela vazia do lado direito. O Trabalho ocupa a largura toda e
              nao muda. */}
          <div
            key={segment}
            ref={telaDaVez}
            className={cn('animate-panel-in 2xl:*:mx-auto', trabalho && 'h-full')}
          >
            {project ? (
              <Outlet context={{ project } satisfies ProjectContext} />
            ) : (
              <LoadingSection />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

/**
 * "Configurar o projeto", **recolhivel, como sempre foi**: o grupo abre e fecha ali
 * mesmo, na lateral, e mostra as telas pelas cinco areas. A pagina central (primeiros
 * passos, busca e o resumo das areas) e o primeiro item dele, "Visao geral" — e nao o
 * unico caminho: um item so, que levava para outra pagina, fez a configuracao parecer
 * escondida para quem ja sabia onde cada tela estava.
 *
 * **Abre sozinho quando a tela aberta e de configuracao**, e nao fecha sozinho: quem
 * abriu o grupo estando no Trabalho quis ver as telas, e elas ficam. Abre fechado no
 * Trabalho — e o que o time faz todo dia, e o grupo empurrava a lista para baixo.
 *
 * **Abrir e fechar e um movimento, e nao um salto**: a altura anda de zero ao tamanho
 * do grupo em 300 ms (`grid-template-rows` de `0fr` a `1fr`, que anima sem medir a
 * altura). Fechado, o grupo fica `inert` — fora do Tab e do leitor de tela, como se
 * nao estivesse ali. Quem pede menos movimento no sistema nao ve a animacao.
 *
 * Recolhida, a lateral mostra so os glifos: o nome de cada area vira um traco entre
 * os grupos, e continua no `aria-label` do grupo para o leitor de tela.
 */
function ConfigNav({
  segment,
  publicId,
  iconOnly,
  onNavigate,
}: {
  segment: string
  publicId: string
  iconOnly: boolean
  onNavigate: () => void
}) {
  const naConfiguracao = isConfigPath(segment)
  const [open, setOpen] = useState(naConfiguracao)

  // **Ao entrar, so a area da tela aberta abre.** As cinco areas abertas de uma vez eram
  // vinte e poucas linhas, passavam da altura da tela e escondiam onde a pessoa estava.
  // Na Visao geral nenhuma abre: a propria pagina ja lista todas as telas, com resumo.
  //
  // **Depois, quem abre e quem fecha e a pessoa.** Trocar de tela abre a area da tela
  // nova e deixa as outras como estavam: fechar sozinho o grupo que alguem acabou de
  // abrir, a cada clique num item, desfazia a escolha dela.
  const areaDaTela = areaAtual(segment)
  const [abertas, setAbertas] = useState<ReadonlySet<ConfigAreaKey>>(() => conjunto(areaDaTela))

  const [segmentoVisto, setSegmentoVisto] = useState(segment)
  if (segmentoVisto !== segment) {
    setSegmentoVisto(segment)
    if (naConfiguracao) setOpen(true)
    if (areaDaTela !== null)
      setAbertas((atuais) => (atuais.has(areaDaTela) ? atuais : new Set([...atuais, areaDaTela])))
  }

  function alternarArea(area: ConfigAreaKey) {
    setAbertas((atuais) => {
      const proximas = new Set(atuais)
      if (proximas.has(area)) proximas.delete(area)
      else proximas.add(area)
      return proximas
    })
  }

  const botao = (
    <button
      type="button"
      onClick={() => setOpen((atual) => !atual)}
      aria-expanded={open}
      aria-controls="configurar-o-projeto"
      aria-label={iconOnly ? 'Configurar o projeto' : undefined}
      className={cn(
        'flex h-[34px] pointer-coarse:h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-detail text-fg-muted transition-colors hover:bg-surface-sunken focus-visible:-outline-offset-2',
      )}
    >
      <span className="flex size-3.5 flex-none items-center justify-center">
        <span
          className={cn(
            'flex transition-transform duration-300 ease-out motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        >
          <Seta direcao="direita" />
        </span>
      </span>
      {!iconOnly && (
        <span data-rotulo className="min-w-0 flex-1 truncate">
          Configurar o projeto
        </span>
      )}
    </button>
  )

  return (
    <div>
      {iconOnly ? <Tooltip content="Configurar o projeto">{botao}</Tooltip> : botao}

      <div
        id="configurar-o-projeto"
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-1 flex flex-col gap-3">
            <SectionLink
              section={{ ...CONFIG_HOME, label: 'Visão geral' }}
              segment={segment}
              publicId={publicId}
              iconOnly={iconOnly}
              onNavigate={onNavigate}
            />
            {CONFIG_AREAS.map((area) => {
              // Com a lateral so de icones, tudo a vista: os glifos ja sao compactos.
              const aberta = iconOnly || abertas.has(area.key)
              return (
                // biome-ignore lint/a11y/useSemanticElements: um grupo de links, e nao um formulario: `fieldset` diria a quem usa leitor de tela que ha campos ali
                <div
                  key={area.key}
                  role="group"
                  aria-label={area.label}
                  className="flex flex-col gap-0.5"
                >
                  {/* **O nome da area e titulo, e nao item**: caixa alta, letra menor e
                    espacada, e as telas embaixo dele recuadas com um fio a esquerda.
                    No mesmo tom e tamanho dos itens, o nome parecia mais um link que
                    nao abria nada. */}
                  {iconOnly ? (
                    // Mesma altura do titulo, com o traco no meio: trocar um pelo outro
                    // nao sobe nem desce os glifos de baixo. No toque, tambem os 40 dele.
                    <div
                      aria-hidden
                      className="relative px-2.5 pt-1 pb-1 text-caption uppercase tracking-wider pointer-coarse:min-h-10"
                    >
                      <span className="invisible">·</span>
                      <span className="absolute inset-x-1 top-1/2 h-px bg-border" />
                    </div>
                  ) : (
                    // O titulo continua titulo (decisao 30): caixa alta, letra menor. A seta
                    // diz que ele abre e fecha as telas de baixo.
                    <button
                      type="button"
                      data-rotulo
                      onClick={() => alternarArea(area.key)}
                      aria-expanded={aberta}
                      aria-controls={`area-da-lateral-${area.key}`}
                      // O anel de foco por dentro: por fora, o item de baixo cobria a linha
                      // dele, e a lateral, que esconde o que passa da borda, cortava os lados.
                      // No toque o titulo abre e fecha com 40 de altura, como os itens.
                      className="flex w-full items-center gap-1.5 rounded-md px-2.5 pt-1 pb-1 text-left font-semibold text-caption text-fg-muted uppercase tracking-wider transition-colors hover:text-fg focus-visible:-outline-offset-2 pointer-coarse:min-h-10"
                    >
                      <span className="min-w-0 flex-1 truncate">{area.label}</span>
                      <span
                        aria-hidden
                        className={cn(
                          'flex flex-none scale-75 transition-transform duration-300 ease-out motion-reduce:transition-none',
                          aberta && 'rotate-90',
                        )}
                      >
                        <Seta direcao="direita" />
                      </span>
                    </button>
                  )}
                  <div
                    id={`area-da-lateral-${area.key}`}
                    inert={!aberta}
                    className={cn(
                      'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                      aberta ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div
                        data-recuo
                        className={cn(
                          'flex flex-col gap-0.5',
                          !iconOnly &&
                            'ml-3.5 border-border border-l pl-1.5 transition-[margin,padding] duration-300 ease-out motion-reduce:transition-none',
                        )}
                      >
                        {/* Membros ja esta no topo, para todos: repetido aqui, a lateral teria
                      dois itens iguais. Na pagina central ele continua na area. */}
                        {area.sections
                          .filter(
                            (section) => !WORK_SECTIONS.some((item) => item.key === section.key),
                          )
                          .map((section) => (
                            <SectionLink
                              key={section.key}
                              section={section}
                              segment={segment}
                              publicId={publicId}
                              iconOnly={iconOnly}
                              onNavigate={onNavigate}
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Um item da lateral que leva a algum lugar. Os grupos usam o mesmo: a diferenca
 * entre eles e de assunto, e nao de aparencia.
 *
 * Marca a tela aberta pelo segmento, e nao pelo `NavLink`: a Instalacao fica marcada
 * tambem em Chaves, que se abre por ela e nao tem item proprio.
 *
 * Recolhida, a lateral mostra so o glifo, e o nome vai para a dica e para o leitor
 * de tela.
 */
function SectionLink({
  section,
  segment,
  publicId,
  iconOnly,
  onNavigate,
}: {
  section: ConsoleSection
  segment: string
  publicId: string
  iconOnly: boolean
  onNavigate: () => void
}) {
  const ativo = isSectionActive(section, segment)

  const link = (
    <Link
      to={`/projects/${publicId}/${section.path}`}
      onClick={onNavigate}
      aria-current={ativo ? 'page' : undefined}
      aria-label={iconOnly ? section.label : undefined}
      className={cn(
        'flex h-[34px] pointer-coarse:h-11 flex-none items-center gap-2.5 rounded-lg px-2.5 text-body transition-colors focus-visible:-outline-offset-2',

        // O item ativo e uma folha sobre o papel da lateral, com o fio dos cartoes. O fio
        // vai por dentro (`ring-inset`): por fora, a lista que rola e a dos grupos, que
        // escondem o que passa da borda, cortavam o lado direito dele.
        ativo
          ? 'bg-surface-raised font-medium text-fg ring-1 ring-border ring-inset'
          : 'text-fg hover:bg-surface-sunken',
      )}
    >
      {/* Apagado quando nao e a secao aberta: com todos no mesmo tom, os glifos
          disputam a atencao com o que esta aberto. */}
      <SectionIcon
        section={section.key}
        className={cn('size-3.5', ativo ? 'text-fg' : 'text-fg-muted')}
      />
      {!iconOnly && (
        <span data-rotulo className="min-w-0 truncate">
          {section.label}
        </span>
      )}
    </Link>
  )

  return iconOnly ? <Tooltip content={section.label}>{link}</Tooltip> : link
}

/** Um botao da lateral que nao navega: recolher a lateral. */
function SideButton({
  iconOnly,
  label,
  onClick,
  icon,
}: {
  iconOnly: boolean
  label: string
  onClick: () => void
  icon: ReactNode
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={iconOnly ? label : undefined}
      className={cn(
        'flex h-[34px] pointer-coarse:h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-detail text-fg-muted transition-colors hover:bg-surface-sunken focus-visible:-outline-offset-2',
      )}
    >
      <span className="flex size-3.5 flex-none items-center justify-center">{icon}</span>
      {!iconOnly && (
        <span data-rotulo className="min-w-0 flex-1 truncate">
          {label}
        </span>
      )}
    </button>
  )

  return iconOnly ? <Tooltip content={label}>{button}</Tooltip> : button
}

/** A area da configuracao em que a tela aberta mora; nenhuma na Visao geral e fora dela. */
function areaAtual(segment: string): ConfigAreaKey | null {
  const section = sectionByPath(segment)
  if (!section || section.key === 'configure') return null
  return areaOfSection(section.key)?.key ?? null
}

function conjunto(area: ConfigAreaKey | null): ReadonlySet<ConfigAreaKey> {
  return new Set(area ? [area] : [])
}

/** O desenho do guia, o mesmo do botao da barra. */
function IconeDoGuia() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M6.3 6.2a1.75 1.75 0 1 1 2.4 1.62c-.45.2-.7.55-.7 1.03v.4" />
      <circle cx="8" cy="11.3" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Seta({ direcao }: { direcao: 'direita' | 'esquerda' }) {
  const caminho = {
    direita: 'm4.5 3 3 3-3 3',
    esquerda: 'm7.5 3-3 3 3 3',
  }[direcao]

  return (
    <svg
      viewBox="0 0 12 12"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={caminho} />
    </svg>
  )
}

function lerRecolhida(): boolean {
  try {
    return window.localStorage.getItem(LATERAL_RECOLHIDA) === '1'
  } catch {
    return false
  }
}

function LoadingSection() {
  return (
    <div className="max-w-170 space-y-3">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="mt-6 h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

/** Quanto a lateral leva para abrir ou fechar — o mesmo `duration-300` da largura. */
const DURACAO_DA_LATERAL = 300

/**
 * Quem pediu menos movimento no sistema ve a lateral trocar de uma vez. Sem
 * `matchMedia` (fora do navegador), tambem.
 */
function semMovimento(): boolean {
  return (
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
