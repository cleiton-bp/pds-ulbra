import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AccountMenu } from '@/app/AccountMenu'
import type { ConsoleSection } from '@/app/navigation'
import { CONFIG_SECTIONS, isConfigPath, sectionByPath, WORK_SECTIONS } from '@/app/navigation'
import { SectionIcon } from '@/app/SectionIcon'
import { ThemeButton } from '@/app/ThemeButton'
import type { ProjectViewModel } from '@/contracts'
import { isPanelError } from '@/data'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Brand } from '@/shared/components/Brand'
import { Button } from '@/shared/components/Button'
import {
  DropdownGroup,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
  DropdownSeparator,
} from '@/shared/components/DropdownMenu'
import { Skeleton } from '@/shared/components/Skeleton'
import { Tooltip } from '@/shared/components/Tooltip'
import type { ProjectContext } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { canConfigure, groupByAccount } from '@/shared/lib/projectAccess'

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
  const navigate = useNavigate()
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

  const project = projects.find((item) => item.PublicId === publicId)
  const accountGroups = groupByAccount(projects)

  // `/projects/:id/<secao>/...`: a secao aberta, e se ela e o card aberto.
  const [, , , segment = '', resto] = location.pathname.split('/')
  const cardAberto = segment === 'reports' && Boolean(resto)

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
    document.title = secao ? `${secao.label} · ${projectName}` : projectName
  }, [projectName, segment, cardAberto])

  // A gaveta e como um dialogo: o foco entra nela ao abrir, Esc fecha, e o foco
  // volta ao botao que abriu. Sem isto, quem usa teclado abria a gaveta e o
  // proximo Tab ia para o seletor do topo, atras do veu.
  const menuButton = useRef<HTMLButtonElement>(null)
  const nav = useRef<HTMLElement>(null)

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
      if (event.key === 'Escape') fecharGaveta(true)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [drawerOpen, fecharGaveta])

  function recolher(valor: boolean) {
    setCollapsed(valor)
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
    <header className="flex h-14 flex-none items-center justify-between gap-2 border-border border-b bg-surface-raised pr-4 pl-4 sm:pr-5 sm:pl-6">
      <div className="flex min-w-0 items-center gap-2.5 lg:gap-4">
        {!failure && (
          <button
            ref={menuButton}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu do projeto"
            aria-expanded={drawerOpen}
            aria-controls="menu-do-projeto"
            className="flex size-8 flex-none items-center justify-center rounded-lg border border-border bg-surface text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg lg:hidden"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <rect x="1" y="3" width="12" height="1.4" rx="0.7" />
              <rect x="1" y="6.3" width="12" height="1.4" rx="0.7" />
              <rect x="1" y="9.6" width="12" height="1.4" rx="0.7" />
            </svg>
          </button>
        )}

        {/* A marca leva aos projetos, em todas as telas. No celular estreito fica
            so o desenho: o nome disputava espaco com o seletor e o espremia. */}
        <Link
          to="/projects"
          title="Ir para os projetos"
          className="flex-none rounded-md max-[400px]:[&>span>span]:hidden"
        >
          <Brand />
        </Link>
        <div className="hidden h-5 w-px flex-none bg-border lg:block" />

        {project ? (
          <DropdownMenu
            align="start"
            width="w-68"
            // Abre com o foco no projeto atual, e nao no primeiro da lista: com
            // varios de nome parecido, e dali que se procura o vizinho.
            onOpenChange={(aberto) => {
              if (aberto) requestAnimationFrame(focarProjetoAtual)
            }}
            trigger={
              <button
                type="button"
                title={project.Name}
                className="flex h-8 min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 font-medium text-fg text-body transition-colors hover:bg-surface-sunken"
              >
                {/* No celular, duas linhas pequenas no lugar de uma cortada: os
                    projetos "Loja — ..." se diferenciam justamente no fim do nome. */}
                <span className="min-w-0 text-left max-sm:line-clamp-2 max-sm:text-caption max-sm:leading-tight sm:max-w-40 sm:truncate">
                  {project.Name}
                </span>
                <span className="flex-none text-caption text-fg-muted">▾</span>
              </button>
            }
          >
            <DropdownGroup>
              {/* O nome da conta so aparece quando ha mais de uma: com uma so,
                  seria um rotulo repetindo o que a pessoa ja sabe. */}
              {accountGroups.map((group) => {
                const items = group.projects.map((item) => {
                  const atual = item.PublicId === project.PublicId
                  return (
                    <DropdownItem key={item.PublicId} onSelect={() => navigate(destino(item))}>
                      {/* O visto marca o aberto. O ponto verde de "ativo" saiu: lia
                          como "online", e o arquivado ja diz que e arquivado. */}
                      <span
                        data-projeto-atual={atual ? '' : undefined}
                        className="flex size-3.5 flex-none items-center justify-center text-fg"
                        aria-hidden
                      >
                        {atual && <Visto />}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          item.Status === 'Archived' && 'text-fg-muted',
                          atual && 'font-medium',
                        )}
                      >
                        {item.Name}
                        {atual && <span className="sr-only"> (aberto)</span>}
                      </span>
                      {item.Status === 'Archived' && (
                        <span className="text-detail text-fg-muted">arquivado</span>
                      )}
                    </DropdownItem>
                  )
                })

                return accountGroups.length > 1 ? (
                  <DropdownSection
                    key={group.account.PublicId}
                    label={group.own ? 'Seus projetos' : group.account.Name}
                  >
                    {items}
                  </DropdownSection>
                ) : (
                  <div key={group.account.PublicId}>{items}</div>
                )
              })}

              {listStatus === 'loading' && (
                <div className="px-2.5 py-2 text-caption text-fg-muted">
                  Carregando os outros projetos…
                </div>
              )}

              {/* O projeto aberto continua na lista porque veio de outra chamada:
                  dizer isso evita a leitura de que os demais sumiram. */}
              {listStatus === 'error' && (
                <DropdownItem quiet onSelect={() => void load()}>
                  <span className="min-w-0 flex-1">Não deu para carregar os outros projetos</span>
                  <span className="flex-none text-fg underline">tentar de novo</span>
                </DropdownItem>
              )}
            </DropdownGroup>

            <DropdownSeparator />

            <DropdownGroup>
              <DropdownItem quiet onSelect={() => navigate('/projects')}>
                Voltar aos projetos
              </DropdownItem>
            </DropdownGroup>
          </DropdownMenu>
        ) : (
          !failure && <Skeleton className="h-8 w-40 min-w-0" />
        )}
      </div>

      <div className="flex flex-none items-center gap-2">
        <ThemeButton />
        <NotificationBell />
        <AccountMenu />
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
  const iconesSo = collapsed && !drawerOpen

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
          className={cn(
            'flex flex-none flex-col gap-5 overflow-y-auto border-border border-r bg-surface-raised py-5',
            'absolute inset-y-0 left-0 z-drawer lg:static',
            iconesSo ? 'w-60 px-3 lg:w-14 lg:px-2' : 'w-60 px-3',
            drawerOpen ? 'flex' : 'hidden lg:flex',
          )}
        >
          <div className="flex flex-col gap-0.5">
            {WORK_SECTIONS.map((section) => (
              <SectionLink
                key={section.key}
                section={section}
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
              <ConfigGroup
                segment={segment}
                publicId={publicId}
                iconOnly={iconesSo}
                onNavigate={() => setDrawerOpen(false)}
              />
            )
          )}

          {/* Recolher, no pe: quem passa o dia no quadro ganha a largura da
              lateral. A escolha fica guardada neste navegador. */}
          <div className="mt-auto hidden lg:block">
            <SideButton
              iconOnly={iconesSo}
              label={collapsed ? 'Abrir o menu' : 'Recolher menu'}
              onClick={() => recolher(!collapsed)}
              icon={<Seta direcao={collapsed ? 'direita' : 'esquerda'} />}
            />
          </div>
        </nav>

        <main
          id="conteudo"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-auto px-5 py-7 outline-none lg:px-10 lg:pt-10 lg:pb-12"
        >
          {/* Tipado nas duas pontas: sem `satisfies` aqui, campo novo no contexto
              compila de um lado e chega `undefined` do outro. */}
          {project ? <Outlet context={{ project } satisfies ProjectContext} /> : <LoadingSection />}
        </main>
      </div>
    </div>
  )
}

/**
 * "Configurar o projeto", recolhivel.
 *
 * **Abre sozinho quando a tela aberta e de configuracao**, e nao fecha sozinho: quem
 * abriu o grupo estando no Trabalho quis ver as telas, e elas ficam. Abre fechado
 * no Trabalho — e o que o time faz todo dia, e o grupo empurrava a lista para
 * baixo.
 */
function ConfigGroup({
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

  const [segmentoVisto, setSegmentoVisto] = useState(segment)
  if (segmentoVisto !== segment) {
    setSegmentoVisto(segment)
    if (naConfiguracao) setOpen(true)
  }

  return (
    <div>
      <SideButton
        iconOnly={iconOnly}
        label="Configurar o projeto"
        onClick={() => setOpen((atual) => !atual)}
        expanded={open}
        controls="configurar-o-projeto"
        muted
        icon={<Seta direcao={open ? 'baixo' : 'direita'} />}
      />

      {open && (
        <div id="configurar-o-projeto" className="mt-1 flex flex-col gap-3">
          {CONFIG_SECTIONS.map((bloco) => (
            <div key={bloco[0]?.key} className="flex flex-col gap-0.5">
              {bloco.map((section) => (
                <SectionLink
                  key={section.key}
                  section={section}
                  publicId={publicId}
                  iconOnly={iconOnly}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Um item da lateral que leva a algum lugar. Os dois grupos usam o mesmo: a
 * diferenca entre eles e de assunto, e nao de aparencia.
 *
 * Recolhida, a lateral mostra so o glifo, e o nome vai para a dica e para o leitor
 * de tela.
 */
function SectionLink({
  section,
  publicId,
  iconOnly,
  onNavigate,
}: {
  section: ConsoleSection
  publicId: string
  iconOnly: boolean
  onNavigate: () => void
}) {
  const link = (
    <NavLink
      to={`/projects/${publicId}/${section.path}`}
      onClick={onNavigate}
      aria-label={iconOnly ? section.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex h-[34px] flex-none items-center gap-2.5 rounded-lg px-2.5 text-body transition-colors',
          iconOnly && 'justify-center px-0',
          isActive ? 'bg-nav-active font-medium text-fg' : 'text-fg hover:bg-surface-sunken',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Apagado quando nao e a secao aberta: com todos no mesmo tom, os
              glifos disputam a atencao com o que esta aberto. */}
          <SectionIcon
            section={section.key}
            className={cn('size-3.5', isActive ? 'text-fg' : 'text-fg-muted')}
          />
          {!iconOnly && section.label}
        </>
      )}
    </NavLink>
  )

  return iconOnly ? <Tooltip content={section.label}>{link}</Tooltip> : link
}

/** Um botao da lateral que nao navega: abrir o grupo, recolher a lateral. */
function SideButton({
  iconOnly,
  label,
  onClick,
  icon,
  expanded,
  controls,
  muted = false,
}: {
  iconOnly: boolean
  label: string
  onClick: () => void
  icon: ReactNode
  expanded?: boolean
  controls?: string
  muted?: boolean
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={iconOnly ? label : undefined}
      className={cn(
        'flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors hover:bg-surface-sunken',
        iconOnly && 'justify-center px-0',
        muted ? 'text-caption text-fg-muted hover:text-fg' : 'text-detail text-fg-muted',
      )}
    >
      <span className="flex size-3.5 flex-none items-center justify-center">{icon}</span>
      {!iconOnly && <span className="min-w-0 flex-1">{label}</span>}
    </button>
  )

  return iconOnly ? <Tooltip content={label}>{button}</Tooltip> : button
}

function Seta({ direcao }: { direcao: 'baixo' | 'direita' | 'esquerda' }) {
  const caminho = {
    baixo: 'm3 4.5 3 3 3-3',
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

function Visto() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m2.5 6.2 2.3 2.3 4.7-5" />
    </svg>
  )
}

/**
 * Leva o foco do menu aberto ao projeto atual. O item do Radix aceita foco, e
 * focado ele fica destacado — as setas andam dali.
 */
function focarProjetoAtual() {
  document.querySelector('[data-projeto-atual]')?.closest<HTMLElement>('[role="menuitem"]')?.focus()
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
