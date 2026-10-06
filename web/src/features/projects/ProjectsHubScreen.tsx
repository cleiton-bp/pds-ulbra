import { useEffect, useId, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ProjectViewModel } from '@/contracts'
import { useSessionStore } from '@/features/auth/sessionStore'
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { StatusDot } from '@/shared/components/StatusDot'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'
import { canConfigure, groupByAccount, roleLabel } from '@/shared/lib/projectAccess'

/**
 * Criar a esquerda, sempre visivel; a lista a direita. Isso resolve o estado
 * vazio sem tela especial: **o convite ja esta na tela o tempo todo**, e a lista
 * vazia so precisa dizer que esta vazia — em voz alta o bastante para quem
 * acabou de entrar saber que nao quebrou nada.
 *
 * Tres coisas aqui aparecem **so quando servem**, e nao o tempo todo: a busca (a
 * partir de cinco projetos), a contagem (so filtrando) e o "Limpar busca" (so
 * quando a busca zerou a lista). Controle que nao faz nada e ruido que a pessoa
 * ainda precisa ler para descobrir que nao faz nada.
 *
 * Pelo mesmo motivo, **o nome da conta so aparece com mais de uma**: quem esta no
 * time de projetos de outras contas ve os grupos ("Seus projetos" primeiro); quem
 * so tem os proprios continua vendo a lista simples de sempre.
 *
 * **Quem perdeu o acesso a um projeto com a tela dele aberta chega aqui com o nome
 * dele**, e o aviso fica ate a pessoa dizer que viu: um toast sumia em segundos, e quem
 * estava no meio de um comentario ficava sem saber por que a tela fechou.
 */
export function ProjectsHubScreen() {
  const projects = useProjectsStore((state) => state.projects)
  const status = useProjectsStore((state) => state.status)
  const error = useProjectsStore((state) => state.error)
  const load = useProjectsStore((state) => state.load)
  const user = useSessionStore((state) => state.user)

  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')

  const location = useLocation()
  const navigate = useNavigate()
  const leftProject = (location.state as { leftProject?: string } | null)?.leftProject

  useEffect(() => {
    void load()
  }, [load])

  const term = query.trim().toLowerCase()
  const rows = projects.filter(
    (project) =>
      !term ||
      project.Name.toLowerCase().includes(term) ||
      project.PublicId.toLowerCase().includes(term),
  )

  // Agrupar ou nao se decide pela lista inteira, e nao pelo que a busca deixou:
  // senao os titulos das contas sumiam e voltavam enquanto a pessoa digitava.
  const grouped = groupByAccount(projects).length > 1
  const groups = groupByAccount(rows)
  const firstName = (user?.Name ?? '').trim().split(/\s+/)[0]

  // Quem so esta no time de projetos dos outros nao pega chave nem instala nada:
  // a frase de quem configura nao serviria para ele.
  const onlyWorks = projects.length > 0 && !projects.some(canConfigure)

  return (
    <div className="px-5 py-7 lg:px-8 lg:pt-12">
      <div className="mx-auto w-full max-w-260">
        <div className="mb-7 lg:mb-10">
          <h1 className="mb-1.5 font-semibold text-hero tracking-tight lg:text-hero-wide">
            Olá{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="max-w-[56ch] text-fg-muted text-body">
            {onlyWorks
              ? 'Abra um projeto para trabalhar nos relatos dele.'
              : 'Abra um projeto para pegar a chave dele e ver o passo a passo da integração.'}
          </p>
        </div>

        {leftProject && (
          <div
            role="status"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn-border bg-warn-surface px-4 py-3"
          >
            <p className="text-body text-warn-fg">
              Você não tem mais acesso ao projeto “{leftProject}”, e a tela dele foi fechada.
            </p>
            <Button size="sm" onClick={() => navigate('.', { replace: true, state: null })}>
              Entendi
            </Button>
          </div>
        )}

        {/* `minmax(0, ...)` nas duas formas: coluna de grade nao encolhe abaixo do
            conteudo sem isso, e o identificador inteiro de um projeto esticava a
            pagina para o lado no celular. */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8">
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <h2 className="mb-1.5 font-semibold text-lead">Criar projeto</h2>
            <p className="mb-4 text-detail text-fg-muted leading-relaxed">
              Um projeto corresponde a um site ou sistema seu. Cada projeto tem a própria chave
              pública.
            </p>
            <Button variant="primary" block onClick={() => setCreating(true)}>
              Criar projeto
            </Button>
          </div>

          <div>
            {/* Buscar entre quatro linhas que cabem na tela e um campo pedindo
                para ser preenchido a toa. */}
            {projects.length > 4 && (
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar projeto"
                aria-label="Buscar projeto"
                className="mb-5 h-9 w-full rounded-lg border border-border bg-surface-raised px-3 text-fg text-body placeholder:text-fg-placeholder"
              />
            )}

            {term && status === 'ready' && (
              <p className="mb-2.5 px-1 text-caption text-fg-muted">
                {rows.length} de {projects.length} projetos
              </p>
            )}

            {/* `idle` entra junto: a store nasce nele e o efeito so dispara no
                quadro seguinte — so com `loading`, a lista piscava vazia antes. */}
            {(status === 'idle' || status === 'loading') && <LoadingRows />}

            {status === 'error' && (
              <div className="flex flex-wrap items-center gap-3.5 border-border border-t py-4.5">
                <p className="text-fg-muted text-body">
                  {error ?? 'Não deu para carregar seus projetos agora.'} Eles continuam salvos.
                </p>
                <Button size="sm" onClick={() => void load()}>
                  Tentar de novo
                </Button>
              </div>
            )}

            {status === 'ready' && rows.length > 0 && !grouped && (
              <ul className="border-border border-t">
                {rows.map((project) => (
                  <li key={project.PublicId}>
                    <ProjectRow project={project} />
                  </li>
                ))}
              </ul>
            )}

            {status === 'ready' && rows.length > 0 && grouped && (
              <div className="flex flex-col gap-7">
                {groups.map((group) => (
                  <AccountSection
                    key={group.account.PublicId}
                    title={group.own ? 'Seus projetos' : group.account.Name}
                    projects={group.projects}
                  />
                ))}
              </div>
            )}

            {status === 'ready' && rows.length === 0 && (
              <div className="rounded-xl border border-border border-dashed px-6 py-10 text-center">
                {projects.length === 0 ? (
                  <>
                    <p className="font-medium text-body text-fg">Nenhum projeto ainda</p>
                    <p className="mx-auto mt-1.5 max-w-[44ch] text-detail text-fg-muted leading-relaxed">
                      Crie o primeiro para receber a chave pública dele e colar o script no seu
                      site.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-body text-fg">Nenhum projeto com esse nome</p>
                    <Button size="sm" variant="quiet" className="mt-4" onClick={() => setQuery('')}>
                      Limpar busca
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

/** Um grupo do hub: a secao leva o nome do proprio titulo, sem repeti-lo. */
function AccountSection({ title, projects }: { title: string; projects: ProjectViewModel[] }) {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="mb-2 px-1 font-medium text-caption text-fg-muted">
        {title}
      </h2>
      <ul className="border-border border-t">
        {projects.map((project) => (
          <li key={project.PublicId}>
            <ProjectRow project={project} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * O arquivado se distingue por tres sinais ao mesmo tempo — ponto cinza, nome
 * apagado e a palavra "arquivado" no lugar da data —, e nao so pela cor.
 */
function ProjectRow({ project }: { project: ProjectViewModel }) {
  const active = project.Status === 'Active'

  return (
    <Link
      to={`/projects/${project.PublicId}`}
      className="flex items-center gap-3 border-border border-b px-1 py-3.5 transition-colors hover:bg-surface-raised"
    >
      <StatusDot active={active} />

      {/* No celular o papel e a data descem para uma linha propria: lado a lado
          com eles, o nome do projeto ficava com duas ou tres letras. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 sm:flex-1">
          <div
            className={cn('truncate font-medium text-body', active ? 'text-fg' : 'text-fg-muted')}
          >
            {project.Name}
          </div>
          {/* E o identificador do projeto na URL, e nao a chave do script — essa e
              a `pk_...` da tela de integracao. Monoespacada para ser lida
              caractere a caractere quando alguem precisa casar uma URL com a
              linha certa. */}
          <div className="mt-0.5 truncate font-mono text-detail text-fg-muted">
            {project.PublicId}
          </div>
        </div>

        <div className="flex flex-none items-center gap-2 sm:gap-3">
          {/* O papel so aparece no projeto dos outros: nos proprios a pessoa e
              sempre dona, e repetir "Dono" em toda linha seria ruido. */}
          {!project.IsAccountOwner && (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-caption text-fg-muted">
              {roleLabel(project)}
            </span>
          )}

          {/* A celula se rotula sozinha. "há 2 dias" solto no fim da linha nao
              diz de que — e cabecalho de coluna para tres campos e mais estrutura
              do que esta lista precisa. */}
          <div className="text-detail text-fg-muted">
            {active ? `criado ${formatRelative(project.CreatedAt)}` : 'arquivado'}
          </div>
        </div>
      </div>

      <svg
        viewBox="0 0 12 12"
        className="size-3 flex-none text-fg-disabled"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m4.5 2.5 4 3.5-4 3.5" />
      </svg>
    </Link>
  )
}

function LoadingRows() {
  return (
    <div className="border-border border-t">
      {[
        { name: 'w-[38%]', id: 'w-[28%]' },
        { name: 'w-[27%]', id: 'w-[34%]' },
        { name: 'w-[44%]', id: 'w-[24%]' },
      ].map((row) => (
        <div key={row.name} className="flex items-center gap-3 border-border border-b px-1 py-4">
          <Skeleton className="size-2 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={cn('h-2.5', row.name)} />
            <Skeleton className={cn('h-2', row.id)} />
          </div>
          <Skeleton className="h-2 w-16" />
        </div>
      ))}
    </div>
  )
}
