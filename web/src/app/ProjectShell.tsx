import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { AccountMenu } from '@/app/AccountMenu'
import { CONSOLE_SECTIONS, LOCKED_SECTIONS } from '@/app/navigation'
import { SectionIcon } from '@/app/SectionIcon'
import { ThemeButton } from '@/app/ThemeButton'
import { isPanelError } from '@/data'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Brand } from '@/shared/components/Brand'
import { Button } from '@/shared/components/Button'
import {
  DropdownGroup,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
} from '@/shared/components/DropdownMenu'
import { LockIcon } from '@/shared/components/LockIcon'
import { Skeleton } from '@/shared/components/Skeleton'
import { StatusDot } from '@/shared/components/StatusDot'
import { Tooltip } from '@/shared/components/Tooltip'
import type { ProjectContext } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'

/**
 * Nao e um booleano `notFound`: "nao encontrado" e "nao deu para saber" pedem
 * acoes diferentes — conferir o endereco ou tentar de novo. Com um so, a frase
 * "ele nao existe ou nao pertence a esta conta" era dita tambem com a API fora do ar.
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

  const openProject = useCallback(async () => {
    if (!publicId) return
    setFailure(null)

    if (!useProjectsStore.getState().projects.some((item) => item.PublicId === publicId)) {
      try {
        await loadOne(publicId)
      } catch (error) {
        setFailure(isPanelError(error) && error.status === 404 ? 'notFound' : 'failed')
        return
      }
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

  if (failure) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-20 text-center">
        <h1 className="font-semibold text-fg text-notice">
          {failure === 'notFound' ? 'Projeto não encontrado' : 'Não deu para abrir este projeto'}
        </h1>
        <p className="mt-1.5 text-fg-muted text-body">
          {failure === 'notFound'
            ? 'Ele não existe ou não pertence a esta conta.'
            : 'A falha foi ao consultar, e não no projeto: ele e as chaves dele seguem como estavam.'}
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
                {projects.map((item) => (
                  <DropdownItem
                    key={item.PublicId}
                    onSelect={() => navigate(`/projects/${item.PublicId}/start`)}
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
                ))}

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
          <div>
            <div className="px-2.5 pb-2 text-caption text-fg-muted">Configuração</div>
            <div className="flex flex-col gap-0.5">
              {CONSOLE_SECTIONS.map((section) => (
                <NavLink
                  key={section.key}
                  to={`/projects/${publicId}/${section.path}`}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-body transition-colors',
                      isActive
                        ? 'bg-nav-active font-medium text-fg'
                        : 'text-fg hover:bg-surface-sunken',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Apagado quando nao e a secao aberta: com todos no mesmo
                          tom, os seis glifos disputam a atencao com o que esta
                          aberto. */}
                      <SectionIcon
                        section={section.key}
                        className={cn('size-3.5', isActive ? 'text-fg' : 'text-fg-muted')}
                      />
                      {section.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          <div>
            {/* O cadeado diz "bloqueado" seis vezes e nao diz "ainda". A
                etiqueta diz uma vez, e o resto do grupo fica so apagado. */}
            <div className="flex items-center gap-2 px-2.5 pb-2">
              <span className="text-caption text-fg-muted">Operação</span>
              <span className="rounded-full border border-border px-1.5 py-px text-caption text-fg-muted">
                em breve
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
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
