import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ProjectViewModel } from '@/contracts'
import { useSessionStore } from '@/features/auth/sessionStore'
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { StatusDot } from '@/shared/components/StatusDot'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'

/**
 * Criar a esquerda, sempre visivel; a lista a direita. Isso resolve o estado
 * vazio sem tela especial — **o convite ja esta na tela o tempo todo**, entao a
 * lista vazia precisa dizer so que esta vazia.
 */
export function ProjectsHubScreen() {
  const projects = useProjectsStore((state) => state.projects)
  const status = useProjectsStore((state) => state.status)
  const error = useProjectsStore((state) => state.error)
  const load = useProjectsStore((state) => state.load)
  const user = useSessionStore((state) => state.user)

  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')

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

  const firstName = (user?.Name ?? '').trim().split(/\s+/)[0]

  return (
    <div className="px-5 py-7 lg:px-8 lg:pt-12">
      <div className="mx-auto w-full max-w-260">
        <div className="mb-7 lg:mb-10">
          <h1 className="mb-1.5 font-semibold text-hero tracking-tight lg:text-hero-wide">
            Olá{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="max-w-[52ch] text-fg-muted text-body">
            Seus projetos ficam aqui. Abra um projeto para pegar a chave dele ou crie um novo.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr] lg:gap-8">
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
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar projeto"
              aria-label="Buscar projeto"
              className="mb-5 h-9 w-full rounded-lg border border-border bg-surface-raised px-3 text-fg text-body placeholder:text-fg-placeholder"
            />

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

            {status === 'ready' && rows.length > 0 && (
              <ul className="border-border border-t">
                {rows.map((project) => (
                  <li key={project.PublicId}>
                    <ProjectRow project={project} />
                  </li>
                ))}
              </ul>
            )}

            {status === 'ready' && rows.length === 0 && (
              <p className="border-border border-t py-4.5 text-fg-muted text-body">
                {projects.length === 0
                  ? 'Nenhum projeto ainda. Crie o primeiro e receba a chave pública dele.'
                  : 'Nenhum projeto com esse nome. Ajuste a busca.'}
              </p>
            )}
          </div>
        </div>
      </div>

      <CreateProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
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
      to={`/projects/${project.PublicId}/start`}
      className="flex items-center gap-3 border-border border-b px-1 py-3.5 transition-colors hover:bg-surface-raised"
    >
      <StatusDot active={active} />

      <div className="min-w-0 flex-1">
        <div className={cn('truncate font-medium text-body', active ? 'text-fg' : 'text-fg-muted')}>
          {project.Name}
        </div>
        {/* E o que vai no script do site do cliente: monoespacada, para ser lido
            caractere a caractere. */}
        <div className="mt-0.5 truncate font-mono text-detail text-fg-muted">
          {project.PublicId}
        </div>
      </div>

      <div className="flex-none text-detail text-fg-muted">
        {active ? formatRelative(project.CreatedAt) : 'arquivado'}
      </div>
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
