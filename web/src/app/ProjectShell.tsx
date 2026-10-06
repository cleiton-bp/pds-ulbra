import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { AccountMenu } from '@/app/AccountMenu'
import type { ConsoleSection } from '@/app/navigation'
import { CONSOLE_SECTIONS, LOCKED_SECTIONS, OPERATION_SECTIONS } from '@/app/navigation'
import { SectionIcon } from '@/app/SectionIcon'
import { ThemeButton } from '@/app/ThemeButton'
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
import { LockIcon } from '@/shared/components/LockIcon'
import { Skeleton } from '@/shared/components/Skeleton'
import { StatusDot } from '@/shared/components/StatusDot'
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

/**
 * A casca de dentro do projeto. O seletor do topo permite trocar de contexto sem
 * voltar ao hub — e o que faz isto parecer console, e nao paginas soltas. Em tela
 * estreita a lateral vira gaveta.
 */
export function ProjectShell() {
  const { publicId = '' } = useParams()
  const navigate = useNavigate()

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

  const project = projects.find((item) => item.PublicId === publicId)
  const accountGroups = groupByAccount(projects)

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

  if (failure) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-20 text-center">
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
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface">
      <header className="flex h-14 flex-none items-center justify-between border-border border-b bg-surface-raised pr-5 pl-6">
        <div className="flex items-center gap-2.5 lg:gap-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu do projeto"
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg lg:hidden"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <rect x="1" y="3" width="12" height="1.4" rx="0.7" />
              <rect x="1" y="6.3" width="12" height="1.4" rx="0.7" />
              <rect x="1" y="9.6" width="12" height="1.4" rx="0.7" />
            </svg>
          </button>

          <Brand />
          <div className="hidden h-5 w-px bg-border lg:block" />

          {project ? (
            <DropdownMenu
              align="start"
              width="w-68"
              trigger={
                <button
                  type="button"
                  className="flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 font-medium text-fg text-body transition-colors hover:bg-surface-sunken"
                >
                  <StatusDot active={project.Status === 'Active'} className="size-[7px]" />
                  <span className="max-w-40 truncate">{project.Name}</span>
                  <span className="text-caption text-fg-muted">▾</span>
                </button>
              }
            >
              <DropdownGroup>
                {/* O nome da conta so aparece quando ha mais de uma: com uma so,
                    seria um rotulo repetindo o que a pessoa ja sabe. O destino e o
                    projeto, e nao uma secao — quem decide a porta e o papel. */}
                {accountGroups.map((group) => {
                  const items = group.projects.map((item) => (
                    <DropdownItem
                      key={item.PublicId}
                      onSelect={() => navigate(`/projects/${item.PublicId}`)}
                    >
                      <StatusDot active={item.Status === 'Active'} className="size-[7px]" />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          item.Status === 'Archived' && 'text-fg-muted',
                        )}
                      >
                        {item.Name}
                      </span>
                      {item.Status === 'Archived' && (
                        <span className="text-detail text-fg-muted">arquivado</span>
                      )}
                    </DropdownItem>
                  ))

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
            <Skeleton className="h-8 w-40" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <ThemeButton />
          <NotificationBell />
          <AccountMenu />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {drawerOpen && (
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 z-drawer-veil bg-overlay lg:hidden"
          />
        )}

        <nav
          aria-label="Seções do projeto"
          className={cn(
            'flex w-60 flex-none flex-col gap-6 border-border border-r bg-surface-raised px-3 py-5',
            'absolute inset-y-0 left-0 z-drawer lg:static',
            drawerOpen ? 'flex' : 'hidden lg:flex',
          )}
        >
          {/* Quem e so membro nao ve a Configuração: ele trabalha nos relatos, e a
              API recusaria tudo o que ele tentasse mudar ali. Enquanto o projeto
              carrega, nada aparece — mostrar e depois sumir piscaria o menu. */}
          {project && canConfigure(project) && (
            <div>
              <div className="px-2.5 pb-2 text-caption text-fg-muted">Configuração</div>
              <div className="flex flex-col gap-0.5">
                {CONSOLE_SECTIONS.map((section) => (
                  <SectionLink
                    key={section.key}
                    section={section}
                    publicId={publicId}
                    onNavigate={() => setDrawerOpen(false)}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            {/* A etiqueta "em breve" ficava aqui enquanto o grupo inteiro
                estava bloqueado. Com **Relatos** no ar ela passou a desmentir a
                primeira linha da lista, e quem diz "ainda nao" agora e a dica de
                cada cadeado, que tambem diz quando. */}
            <div className="px-2.5 pb-2 text-caption text-fg-muted">Operação</div>
            <div className="flex flex-col gap-0.5">
              {OPERATION_SECTIONS.map((section) => (
                <SectionLink
                  key={section.key}
                  section={section}
                  publicId={publicId}
                  onNavigate={() => setDrawerOpen(false)}
                />
              ))}

              {LOCKED_SECTIONS.map((section) => (
                <Tooltip key={section.key} content={section.hint}>
                  {/* `button` e nao `div`: sem foco pelo teclado, a dica que explica
                      o bloqueio so existiria para quem usa mouse. */}
                  <button
                    type="button"
                    aria-disabled="true"
                    className="flex h-[34px] w-full cursor-default items-center gap-2.5 rounded-lg px-2.5 text-fg-muted text-body"
                  >
                    <LockIcon className="size-3.5 opacity-85" />
                    <span className="flex-1 text-left">{section.label}</span>
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        </nav>

        <div className="min-w-0 flex-1 overflow-auto px-5 py-7 lg:px-10 lg:pt-10 lg:pb-12">
          {/* Tipado nas duas pontas: sem `satisfies` aqui, campo novo no contexto
              compila de um lado e chega `undefined` do outro. */}
          {project ? <Outlet context={{ project } satisfies ProjectContext} /> : <LoadingSection />}
        </div>
      </div>
    </div>
  )
}

/**
 * Um item da lateral que leva a algum lugar. Os dois grupos usam o mesmo: a
 * diferenca entre "Configuração" e "Operação" e de assunto, e nao de aparencia.
 */
function SectionLink({
  section,
  publicId,
  onNavigate,
}: {
  section: ConsoleSection
  publicId: string
  onNavigate: () => void
}) {
  return (
    <NavLink
      to={`/projects/${publicId}/${section.path}`}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-body transition-colors',
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
          {section.label}
        </>
      )}
    </NavLink>
  )
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
