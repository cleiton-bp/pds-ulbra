import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProjectViewModel } from '@/contracts'
import { Button } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'
import { groupByAccount } from '@/shared/lib/projectAccess'
import { readRecentProjects } from '@/shared/lib/recentProjects'
import { guideTarget } from '@/shared/tour/guideStore'

/** Quantos recentes aparecem em cima: o projeto do dia a dia a um clique, e nao uma lista a mais. */
const RECENTES = 3

type Secao = { chave: string; titulo: string | null; itens: ProjectViewModel[] }

/** Sem acento e sem caixa: "emporio" acha "Empório". */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

const porNome = (a: ProjectViewModel, b: ProjectViewModel) => a.Name.localeCompare(b.Name, 'pt-BR')

/** A segunda linha de cada projeto: o mesmo que a tela de projetos diz dele. */
function apoioDe(projeto: ProjectViewModel): string {
  if (projeto.Status !== 'Active') return 'arquivado'
  return projeto.LastActivityAt
    ? `último movimento ${formatRelative(projeto.LastActivityAt)}`
    : `criado ${formatRelative(projeto.CreatedAt)}`
}

/**
 * Trocar de projeto sem sair da tela: o nome do projeto na barra de cima abre a lista.
 *
 * **Era um menu, e menu nao sabe buscar.** Com dezesseis projetos a lista abria rolada
 * ate o atual, sem mostrar que rolou, cortava o nome justamente no fim (onde dois
 * projetos de nome parecido se diferenciam) e misturava os arquivados. Agora: a busca ja com o foco, os recentes em cima, todos em ordem
 * alfabetica, os arquivados recolhidos no fim e o nome inteiro, em ate duas linhas.
 *
 * **As setas andam e o Enter abre**, com o foco sempre na busca: escrever e escolher
 * sao o mesmo gesto. Esc fecha e devolve o foco ao botao.
 */
export function ProjectSwitcher({
  project,
  projects,
  status,
  userId,
  destino,
  aoTentarDeNovo,
}: {
  project: ProjectViewModel
  projects: ProjectViewModel[]
  status: string
  userId: string | undefined
  /** O mesmo lugar no outro projeto, se o papel da pessoa la deixar. */
  destino: (alvo: ProjectViewModel) => string
  aoTentarDeNovo: () => void
}) {
  const navigate = useNavigate()
  const listaId = useId()
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(0)
  const [verArquivados, setVerArquivados] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const gatilho = useRef<HTMLButtonElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)

  function fechar(devolverFoco: boolean) {
    setAberto(false)
    setBusca('')
    setAtivo(0)
    setVerArquivados(false)
    if (devolverFoco) gatilho.current?.focus()
  }

  // Clique fora fecha, como os outros menus do painel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fechar so mexe em estado e no foco.
  useEffect(() => {
    if (!aberto) return
    const fora = (evento: PointerEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) fechar(false)
    }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberto])

  useEffect(() => {
    if (aberto) campo.current?.focus()
  }, [aberto])

  const termo = semAcento(busca.trim())
  const ativos = projects.filter((item) => item.Status === 'Active').sort(porNome)
  const arquivados = projects.filter((item) => item.Status !== 'Active').sort(porNome)

  const secoes: Secao[] = []
  if (termo) {
    const achados = [...ativos, ...arquivados].filter((item) =>
      semAcento(item.Name).includes(termo),
    )
    secoes.push({ chave: 'busca', titulo: null, itens: achados })
  } else {
    const porId = new Map(ativos.map((item) => [item.PublicId, item]))
    const recentes = userId
      ? readRecentProjects(userId)
          .flatMap((recente) => {
            const item = porId.get(recente.publicId)
            return item && item.PublicId !== project.PublicId ? [item] : []
          })
          .slice(0, RECENTES)
      : []
    // Com poucos projetos, os recentes so repetiriam a lista inteira logo abaixo.
    if (recentes.length > 0 && ativos.length > RECENTES + 2)
      secoes.push({ chave: 'recentes', titulo: 'Recentes', itens: recentes })
    const contas = groupByAccount(ativos)
    if (contas.length > 1)
      for (const conta of contas)
        secoes.push({
          chave: conta.account.PublicId,
          titulo: conta.own ? 'Seus projetos' : conta.account.Name,
          itens: conta.projects,
        })
    else secoes.push({ chave: 'todos', titulo: 'Todos os projetos', itens: ativos })
    if (verArquivados) secoes.push({ chave: 'arquivados', titulo: 'Arquivados', itens: arquivados })
  }
  const linhas = secoes.flatMap((secao) =>
    secao.itens.map((item) => ({ secao: secao.chave, item })),
  )
  const idDaLinha = (indice: number) => `${listaId}-${indice}`

  // A linha da vez fica a vista enquanto as setas andam.
  useEffect(() => {
    if (!aberto) return
    document.getElementById(`${listaId}-${ativo}`)?.scrollIntoView({ block: 'nearest' })
  }, [aberto, ativo, listaId])

  function abrir(item: ProjectViewModel) {
    fechar(false)
    if (item.PublicId !== project.PublicId) navigate(destino(item))
  }

  function tecla(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      if (linhas.length === 0) return
      const passo = evento.key === 'ArrowDown' ? 1 : -1
      setAtivo((atual) => (atual + passo + linhas.length) % linhas.length)
    } else if (evento.key === 'Enter') {
      evento.preventDefault()
      const linha = linhas[ativo]
      if (linha) abrir(linha.item)
    } else if (evento.key === 'Escape') {
      evento.preventDefault()
      fechar(true)
    }
  }

  let indice = -1

  return (
    <div ref={raiz} className="relative min-w-0">
      <button
        ref={gatilho}
        type="button"
        title={project.Name}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => (aberto ? fechar(false) : setAberto(true))}
        {...guideTarget('projeto')}
        className="flex h-8 min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-raised px-2.5 font-medium text-fg text-body transition-colors hover:bg-surface-sunken"
      >
        {/* No celular, duas linhas pequenas no lugar de uma cortada: os projetos "Loja,
            ..." se diferenciam justamente no fim do nome. */}
        <span className="min-w-0 text-left max-sm:line-clamp-2 max-sm:text-caption max-sm:leading-tight sm:max-w-64 sm:truncate">
          {project.Name}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'flex-none text-caption text-fg-muted transition-transform duration-200 motion-reduce:transition-none',
            aberto && 'rotate-180',
          )}
        >
          ▾
        </span>
      </button>

      {aberto && (
        <div className="z-dialog flex origin-top-left animate-menu-in flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg max-sm:fixed max-sm:inset-x-3 max-sm:top-15 sm:absolute sm:top-full sm:left-0 sm:mt-1.5 sm:w-104 dark:bg-surface-strong">
          <div className="border-border border-b p-2">
            <input
              ref={campo}
              type="search"
              value={busca}
              onChange={(evento) => {
                setBusca(evento.target.value)
                setAtivo(0)
              }}
              onKeyDown={tecla}
              placeholder="Buscar projeto pelo nome"
              aria-label="Buscar projeto"
              role="combobox"
              aria-expanded="true"
              aria-controls={listaId}
              aria-activedescendant={linhas.length > 0 ? idDaLinha(ativo) : undefined}
              aria-autocomplete="list"
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-placeholder [&::-webkit-search-cancel-button]:hidden"
            />
          </div>

          <div
            ref={lista}
            id={listaId}
            role="listbox"
            aria-label="Projetos"
            className="max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain p-1.5"
          >
            {secoes.map((secao) => (
              // biome-ignore lint/a11y/useSemanticElements: um grupo de opcoes dentro da lista, e nao um formulario: `fieldset` anunciaria campos que nao existem.
              <div key={secao.chave} role="group" aria-label={secao.titulo ?? 'Resultado da busca'}>
                {secao.titulo && (
                  <p className="px-2.5 pt-2 pb-1 font-medium text-caption text-fg-muted">
                    {secao.titulo}
                  </p>
                )}
                {secao.itens.map((item) => {
                  indice += 1
                  const meu = indice
                  const atual = item.PublicId === project.PublicId
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: as teclas ficam na busca (setas e Enter), como num combobox; a linha so recebe o clique.
                    <div
                      key={`${secao.chave}-${item.PublicId}`}
                      id={idDaLinha(meu)}
                      role="option"
                      aria-selected={meu === ativo}
                      aria-current={atual ? 'true' : undefined}
                      tabIndex={-1}
                      onPointerMove={() => setAtivo(meu)}
                      onClick={() => abrir(item)}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 transition-colors duration-100 motion-reduce:transition-none',
                        meu === ativo && 'bg-surface-sunken',
                      )}
                    >
                      <span
                        className="mt-0.5 flex size-4 flex-none items-center justify-center text-fg"
                        aria-hidden="true"
                      >
                        {atual && <Visto />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'line-clamp-2 break-words text-body',
                            item.Status === 'Active' ? 'text-fg' : 'text-fg-muted',
                            atual && 'font-medium',
                          )}
                        >
                          {item.Name}
                          {atual && <span className="sr-only"> (aberto)</span>}
                        </span>
                        <span className="block text-caption text-fg-muted">{apoioDe(item)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}

            {termo && linhas.length === 0 && (
              <p className="px-2.5 py-3 text-detail text-fg-muted">Nenhum projeto com esse nome.</p>
            )}

            {!termo && arquivados.length > 0 && !verArquivados && (
              <button
                type="button"
                onClick={() => {
                  setVerArquivados(true)
                  campo.current?.focus()
                }}
                className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-caption text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
              >
                <span aria-hidden="true">›</span>
                Mostrar os arquivados ({arquivados.length})
              </button>
            )}

            {status === 'loading' && (
              <p className="px-2.5 py-2 text-caption text-fg-muted">
                Carregando os outros projetos…
              </p>
            )}
            {/* O projeto aberto continua na lista porque veio de outra chamada: dizer isso
                evita a leitura de que os demais sumiram. */}
            {status === 'error' && (
              <button
                type="button"
                onClick={aoTentarDeNovo}
                className="w-full rounded-lg px-2.5 py-2 text-left text-caption text-fg-muted hover:bg-surface-sunken"
              >
                Não deu para carregar os outros projetos,{' '}
                <span className="text-fg underline">tentar de novo</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-border border-t p-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                fechar(false)
                navigate('/projects', { state: { criarProjeto: true } })
              }}
            >
              Criar projeto
            </Button>
            <Button
              size="sm"
              onClick={() => {
                fechar(false)
                navigate('/projects')
              }}
            >
              Ver todos os projetos
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Visto() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m2.5 6.2 2.3 2.3 4.7-5" />
    </svg>
  )
}
