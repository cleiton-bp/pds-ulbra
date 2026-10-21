import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ProjectViewModel } from '@/contracts'
import { useSessionStore } from '@/features/auth/sessionStore'
import { CreateProjectDialog } from '@/features/projects/CreateProjectDialog'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { SearchShortcutHint } from '@/shared/components/SearchShortcutHint'
import { Skeleton } from '@/shared/components/Skeleton'
import { StatusDot } from '@/shared/components/StatusDot'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'
import { groupByAccount, roleLabel } from '@/shared/lib/projectAccess'
import { readRecentProjects } from '@/shared/lib/recentProjects'

/**
 * A partir de quantos projetos a busca, os abertos recentemente, a ordem e os arquivados a
 * parte aparecem. Abaixo disso a lista inteira cabe na tela, e esses controles seriam
 * ruido que a pessoa ainda precisa ler para descobrir que nao fazem nada.
 */
const MUITOS = 5

/** Quantos recentes o hub mostra: quatro no computador, dois no celular. */
const RECENTES_NA_TELA = 4

/** A ordem da lista: o ultimo movimento primeiro, ou pelo nome. */
type Ordem = 'movimento' | 'nome'

/** A ordem escolhida fica no navegador: e conveniencia de quem olha, como o tema. */
const CHAVE_DA_ORDEM = 'pds.web.projects-order.v1'

function lerOrdem(): Ordem {
  try {
    return window.localStorage.getItem(CHAVE_DA_ORDEM) === 'nome' ? 'nome' : 'movimento'
  } catch {
    return 'movimento'
  }
}

function guardarOrdem(ordem: Ordem): void {
  try {
    window.localStorage.setItem(CHAVE_DA_ORDEM, ordem)
  } catch {
    // Sem armazenamento, a ordem so nao fica para a proxima visita.
  }
}

/** O ultimo movimento do projeto; sem card nenhum, quando ele nasceu. */
function movimentoDe(project: ProjectViewModel): number {
  return Date.parse(project.LastActivityAt ?? project.CreatedAt) || 0
}

function ordenar(projects: ProjectViewModel[], ordem: Ordem): ProjectViewModel[] {
  const copia = [...projects]
  if (ordem === 'nome')
    return copia.sort((a, b) => a.Name.localeCompare(b.Name, 'pt-BR', { sensitivity: 'base' }))
  return copia.sort((a, b) => movimentoDe(b) - movimentoDe(a))
}

/**
 * Criar a esquerda, sempre visivel; a lista a direita. Isso resolve o estado
 * vazio sem tela especial: **o convite ja esta na tela o tempo todo**, e a lista
 * vazia so precisa dizer que esta vazia — em voz alta o bastante para quem
 * acabou de entrar saber que nao quebrou nada. **No celular a lista vem primeiro**,
 * e criar vira um botao ao lado do titulo: o hub e a primeira tela de toda sessao,
 * e quem abre o painel quer escolher onde trabalhar.
 *
 * **A linha fala do trabalho, e nao da instalacao.** Ja mostrou o identificador do
 * projeto e "criado ha X"; agora diz quando foi o ultimo movimento. O
 * identificador continua na tela Projeto, onde alguem precisa dele.
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
 *
 * **Com muitos projetos, a lista se organiza em vez de se dividir em paginas.** Projeto
 * nao e item de feed: a pessoa quer ver todos e achar o dela rapido, e pagina seria
 * esconder o projeto que ela procura atras de um clique sem nome. Entao, a partir de
 * cinco projetos: **os abertos recentemente no topo** (deste navegador — o projeto do dia
 * a dia fica a um clique, qualquer que seja a ordem); **a ordem pelo ultimo movimento**,
 * ou pelo nome, a escolha da pessoa; **os arquivados recolhidos no fim**, fora do caminho
 * e sem sumir; e **a busca com o atalho "/"**, como no Trabalho. Buscando, a lista e uma
 * so, com os arquivados juntos: quem procura pelo nome quer achar, onde quer que esteja.
 */
export function ProjectsHubScreen() {
  const projects = useProjectsStore((state) => state.projects)
  const status = useProjectsStore((state) => state.status)
  const error = useProjectsStore((state) => state.error)
  const load = useProjectsStore((state) => state.load)
  const user = useSessionStore((state) => state.user)

  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [ordem, setOrdem] = useState<Ordem>(lerOrdem)
  const busca = useRef<HTMLInputElement>(null)
  const listaId = useId()
  const recentesId = useId()

  const location = useLocation()
  const navigate = useNavigate()
  const leftProject = (location.state as { leftProject?: string } | null)?.leftProject

  useEffect(() => {
    void load()
  }, [load])

  const muitos = projects.length >= MUITOS
  const term = query.trim().toLowerCase()
  const encontra = (project: ProjectViewModel) =>
    !term ||
    project.Name.toLowerCase().includes(term) ||
    project.PublicId.toLowerCase().includes(term)

  const ativos = projects.filter((project) => project.Status === 'Active')
  const arquivados = projects.filter((project) => project.Status !== 'Active')

  // Os ativos primeiro, sempre. Com muitos projetos e sem busca, os arquivados saem da
  // lista e vao para a secao recolhida do fim; buscando, voltam para junto, depois dos
  // ativos.
  const rows =
    muitos && !term
      ? ordenar(ativos, ordem)
      : [...ordenar(ativos.filter(encontra), ordem), ...ordenar(arquivados.filter(encontra), ordem)]
  const recolhidos = muitos && !term ? ordenar(arquivados, ordem) : []

  /**
   * Os abertos por ultimo neste navegador, so os que a pessoa ainda enxerga e que estao
   * ativos — o arquivado tem a secao dele. Lidos de novo quando a lista muda.
   */
  const userId = user?.PublicId
  const recentes = useMemo(() => {
    if (!userId || projects.length < MUITOS) return []
    const ativosPorId = new Map(
      projects.filter((project) => project.Status === 'Active').map((p) => [p.PublicId, p]),
    )
    return readRecentProjects(userId)
      .flatMap((recente) => {
        const project = ativosPorId.get(recente.publicId)
        return project ? [{ project, openedAt: recente.openedAt }] : []
      })
      .slice(0, RECENTES_NA_TELA)
  }, [userId, projects])

  // O "/" leva a busca, de qualquer lugar da tela — menos de dentro de outro campo, ou com
  // um dialogo aberto (o de criar projeto), onde a barra e um caractere.
  useEffect(() => {
    if (!muitos) return
    function tecla(evento: globalThis.KeyboardEvent) {
      if (evento.key !== '/' || evento.ctrlKey || evento.metaKey || evento.altKey) return
      const alvo = evento.target instanceof Element ? evento.target : null
      if (alvo?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
      evento.preventDefault()
      busca.current?.focus()
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [muitos])

  /** O Esc dentro da busca limpa o que foi digitado; com ela vazia, sai do campo. */
  function teclaNaBusca(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key !== 'Escape') return
    evento.preventDefault()
    if (query) setQuery('')
    else busca.current?.blur()
  }

  function trocarOrdem(proxima: Ordem) {
    setOrdem(proxima)
    guardarOrdem(proxima)
  }

  // Agrupar ou nao se decide pela lista inteira, e nao pelo que a busca deixou:
  // senao os titulos das contas sumiam e voltavam enquanto a pessoa digitava.
  const grouped = groupByAccount(projects).length > 1
  const groups = groupByAccount(rows)
  const firstName = (user?.Name ?? '').trim().split(/\s+/)[0]

  return (
    <div className="px-5 py-7 lg:px-8 lg:pt-12">
      <div className="mx-auto w-full max-w-260">
        <div className="mb-7 flex items-start justify-between gap-4 lg:mb-10">
          <div className="min-w-0">
            <h1 className="mb-1.5 font-semibold text-hero tracking-tight lg:text-hero-wide">
              Olá{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="max-w-[56ch] text-fg-muted text-body">
              Escolha um projeto para ver o trabalho do time.
            </p>
          </div>
          <Button size="sm" className="flex-none lg:hidden" onClick={() => setCreating(true)}>
            Criar projeto
          </Button>
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
          <div className="hidden rounded-xl border border-border bg-surface-raised p-5 lg:block">
            <h2 className="mb-1.5 font-semibold text-lead">Criar projeto</h2>
            <p className="mb-4 text-detail text-fg-muted leading-relaxed">
              Um projeto corresponde a um sistema seu, site ou aplicação. Ele nasce pronto do jeito
              que o time trabalha: Quadro simples, Suporte, Kanban ou Scrum.
            </p>
            <Button variant="primary" block onClick={() => setCreating(true)}>
              Criar projeto
            </Button>
          </div>

          <div>
            {/* Buscar entre quatro linhas que cabem na tela e um campo pedindo
                para ser preenchido a toa. */}
            {muitos && (
              <div className="relative mb-6">
                <svg
                  viewBox="0 0 16 16"
                  className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-3.5 text-fg-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="m10.5 10.5 3 3" />
                </svg>
                <input
                  ref={busca}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={teclaNaBusca}
                  placeholder="Buscar projeto"
                  aria-label="Buscar projeto"
                  aria-keyshortcuts="/"
                  title="Buscar pelo nome — atalho: /"
                  className="peer h-9 w-full rounded-lg border border-border bg-surface-raised pr-10 pl-9 text-fg text-body transition-colors duration-150 placeholder:text-fg-placeholder motion-reduce:transition-none [&::-webkit-search-cancel-button]:hidden"
                />
                <SearchShortcutHint visible={query === ''} />
                {/* O limpar do navegador sai (o "x" azul nao conversa com o resto do painel), e
                    entra este, no lugar da dica do "/": so com texto, e devolvendo o foco. */}
                {query !== '' && (
                  <button
                    type="button"
                    aria-label="Limpar busca"
                    title="Limpar busca (Esc)"
                    onClick={() => {
                      setQuery('')
                      busca.current?.focus()
                    }}
                    className="-translate-y-1/2 absolute top-1/2 right-1.5 flex size-6 animate-fade-in items-center justify-center rounded-md text-fg-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-fg motion-reduce:transition-none"
                  >
                    <svg
                      viewBox="0 0 12 12"
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="m3 3 6 6M9 3 3 9" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* **O projeto do dia a dia a um clique**, qualquer que seja a ordem: os
                abertos por ultimo neste navegador. Somem buscando — ai quem decide o que
                aparece e o que a pessoa digitou. */}
            {status === 'ready' && !term && recentes.length > 0 && (
              <section aria-labelledby={recentesId} className="mb-7">
                <h2 id={recentesId} className="mb-2 px-1 font-medium text-caption text-fg-muted">
                  Abertos recentemente
                </h2>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {recentes.map(({ project, openedAt }, indice) => (
                    <li key={project.PublicId} className={cn(indice >= 2 && 'hidden sm:block')}>
                      <RecentCard project={project} openedAt={openedAt} ordem={indice} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* O titulo da lista diz quantos, e buscando, quantos de quantos; a ordem fica
                ao lado dele, onde a pessoa ja esta olhando. */}
            {status === 'ready' && muitos && (
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <h2 id={listaId} className="font-medium text-caption text-fg-muted">
                  {term
                    ? `${rows.length} de ${projects.length} projetos`
                    : `Projetos ativos · ${ativos.length}`}
                </h2>
                <OrdemDaLista value={ordem} onChange={trocarOrdem} />
              </div>
            )}

            {term && status === 'ready' && !muitos && (
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
                  Não deu para carregar seus projetos agora. Eles continuam salvos.
                  {error && <span className="block text-detail">{error}</span>}
                </p>
                <Button size="sm" onClick={() => void load()}>
                  Tentar de novo
                </Button>
              </div>
            )}

            {/* A chave e a ordem: trocar a ordem faz as linhas chegarem de novo, uma depois
                da outra, em vez de pularem de lugar de uma vez. */}
            {status === 'ready' && rows.length > 0 && !grouped && (
              <ul
                key={ordem}
                aria-labelledby={muitos ? listaId : undefined}
                className="border-border border-t"
              >
                {rows.map((project, indice) => (
                  <li key={project.PublicId}>
                    <ProjectRow project={project} ordem={indice} />
                  </li>
                ))}
              </ul>
            )}

            {status === 'ready' && rows.length > 0 && grouped && (
              <div key={ordem} className="flex flex-col gap-7">
                {groups.map((group) => (
                  <AccountSection
                    key={group.account.PublicId}
                    title={group.own ? 'Seus projetos' : group.account.Name}
                    projects={group.projects}
                  />
                ))}
              </div>
            )}

            {status === 'ready' && !term && rows.length === 0 && recolhidos.length > 0 && (
              <p className="border-border border-t px-1 py-4 text-detail text-fg-muted">
                Nenhum projeto ativo. Os arquivados estão logo abaixo.
              </p>
            )}

            {/* Fora do caminho, e sem sumir: o arquivado ainda e lido, so nao e mais onde se
                trabalha. A seta e o "Arquivados · 2" dizem que ha o que abrir. */}
            {status === 'ready' && recolhidos.length > 0 && (
              <details className="details-smooth group/arquivados mt-7">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded px-1 font-medium text-caption text-fg-muted transition-colors duration-150 hover:text-fg motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
                  <svg
                    viewBox="0 0 12 12"
                    className="size-2.5 flex-none transition-transform duration-300 ease-out group-open/arquivados:rotate-90 motion-reduce:transition-none"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
                  </svg>
                  Arquivados · {recolhidos.length}
                </summary>
                <ul className="mt-2 border-border border-t">
                  {recolhidos.map((project, indice) => (
                    <li key={project.PublicId}>
                      <ProjectRow project={project} ordem={indice} />
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {status === 'ready' && rows.length === 0 && recolhidos.length === 0 && (
              <div className="rounded-xl border border-border border-dashed px-6 py-10 text-center">
                {projects.length === 0 ? (
                  <>
                    <p className="font-medium text-body text-fg">Nenhum projeto ainda</p>
                    <p className="mx-auto mt-1.5 max-w-[44ch] text-detail text-fg-muted leading-relaxed">
                      Crie o primeiro para receber a chave pública dele e colar o script no seu
                      sistema.
                    </p>
                    <p className="mx-auto mt-3 max-w-[44ch] text-detail text-fg-muted leading-relaxed">
                      Foi convidado para um time? Abra o link do e-mail de convite usando a conta
                      Google daquele endereço.
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

/**
 * A ordem da lista, em duas pecas. **Sao botoes que se dizem marcados** (`aria-pressed`), e
 * nao abas: trocar a ordem nao troca o que se ve, so a sequencia.
 */
function OrdemDaLista({ value, onChange }: { value: Ordem; onChange: (ordem: Ordem) => void }) {
  const opcoes: ReadonlyArray<{ value: Ordem; label: string; dica: string }> = [
    { value: 'movimento', label: 'Movimento', dica: 'O último movimento primeiro' },
    { value: 'nome', label: 'Nome', dica: 'Em ordem alfabética' },
  ]
  return (
    <fieldset className="m-0 inline-flex min-w-0 flex-none rounded-lg border border-border bg-surface p-0.5">
      <legend className="sr-only">Ordem dos projetos</legend>
      {opcoes.map((opcao) => (
        <button
          key={opcao.value}
          type="button"
          aria-pressed={value === opcao.value}
          title={opcao.dica}
          onClick={() => onChange(opcao.value)}
          className={cn(
            'h-6 rounded-md px-2 text-caption transition-colors duration-150 motion-reduce:transition-none',
            value === opcao.value
              ? 'bg-surface-sunken font-medium text-fg'
              : 'text-fg-muted hover:text-fg',
          )}
        >
          {opcao.label}
        </button>
      ))}
    </fieldset>
  )
}

/**
 * Um aberto recentemente: o nome e quando a pessoa o abriu — e nao o ultimo movimento,
 * que e o que a lista embaixo diz. Chegam um depois do outro, como as linhas.
 */
function RecentCard({
  project,
  openedAt,
  ordem,
}: {
  project: ProjectViewModel
  openedAt: string
  ordem: number
}) {
  return (
    <Link
      to={`/projects/${project.PublicId}`}
      style={{ animationDelay: `${ordem * 40}ms` }}
      className="group flex animate-pop items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5 transition-colors duration-150 hover:bg-surface-sunken active:bg-surface-strong motion-reduce:transition-none"
    >
      <StatusDot active />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-body text-fg">{project.Name}</div>
        <div className="text-caption text-fg-muted">aberto {formatRelative(openedAt)}</div>
      </div>
      <svg
        viewBox="0 0 12 12"
        className="size-3 flex-none text-fg-disabled transition-[translate,color] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-fg-muted motion-reduce:transition-none"
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

/** Um grupo do hub: a secao leva o nome do proprio titulo, sem repeti-lo. */
function AccountSection({ title, projects }: { title: string; projects: ProjectViewModel[] }) {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="mb-2 px-1 font-medium text-caption text-fg-muted">
        {title}
      </h2>
      <ul className="border-border border-t">
        {projects.map((project, indice) => (
          <li key={project.PublicId}>
            <ProjectRow project={project} ordem={indice} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Quantas linhas chegam uma depois da outra; da decima em diante, todas juntas. */
const LINHAS_EM_SEQUENCIA = 10

/**
 * O arquivado se distingue por tres sinais ao mesmo tempo — ponto cinza, nome
 * apagado e a palavra "arquivado" no lugar da data —, e nao so pela cor.
 *
 * **As linhas chegam uma depois da outra** (`ordem`), em vez de a lista aparecer de
 * uma vez; passa de dez, o resto chega junto, senao a ultima esperaria segundos. Sob
 * o mouse a linha levanta o fundo e a seta anda um fio para a direita: e para onde o
 * clique leva. Com movimento reduzido, nada disso.
 */
function ProjectRow({ project, ordem = 0 }: { project: ProjectViewModel; ordem?: number }) {
  const active = project.Status === 'Active'

  return (
    <Link
      to={`/projects/${project.PublicId}`}
      style={{ animationDelay: `${Math.min(ordem, LINHAS_EM_SEQUENCIA) * 40}ms` }}
      className="group flex animate-pop items-center gap-3 border-border border-b px-1 py-3.5 transition-colors duration-150 hover:bg-surface-raised active:bg-surface-sunken motion-reduce:transition-none"
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
        </div>

        <div className="flex flex-none items-center gap-2 sm:gap-3">
          {/* O papel so aparece no projeto dos outros: nos proprios a pessoa e
              sempre dona, e repetir "Dono" em toda linha seria ruido. */}
          {!project.IsAccountOwner && (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-caption text-fg-muted">
              {roleLabel(project)}
            </span>
          )}

          {/* A celula se rotula sozinha. "ha 2 dias" solto no fim da linha nao
              diz de que — e cabecalho de coluna para tres campos e mais estrutura
              do que esta lista precisa. */}
          <div className="text-detail text-fg-muted">
            {!active
              ? 'arquivado'
              : project.LastActivityAt
                ? `último movimento ${formatRelative(project.LastActivityAt)}`
                : `criado ${formatRelative(project.CreatedAt)}`}
          </div>
        </div>
      </div>

      <svg
        viewBox="0 0 12 12"
        className="size-3 flex-none text-fg-disabled transition-[translate,color] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-fg-muted motion-reduce:transition-none"
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
      {['w-[38%]', 'w-[27%]', 'w-[44%]'].map((width) => (
        <div key={width} className="flex items-center gap-3 border-border border-b px-1 py-4">
          <Skeleton className="size-2 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={cn('h-2.5', width)} />
          </div>
          <Skeleton className="h-2 w-16" />
        </div>
      ))}
    </div>
  )
}
