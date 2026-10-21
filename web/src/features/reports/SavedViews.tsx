import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { NO_REPORT_FILTERS } from '@/data'
import {
  NO_LIST_FILTERS,
  sameWorkView,
  type WorkView,
  workViewFromQuery,
  workViewToQuery,
} from '@/features/reports/useWorkFilters'
import { cn } from '@/shared/lib/cn'

/** Uma vista salva: o nome que a pessoa deu, e o endereco dos filtros. */
interface VistaSalva {
  nome: string
  /** O `?` dos filtros, como no endereco: o mesmo formato, conferido do mesmo jeito. */
  consulta: string
}

/** Quantas vistas cabem: mais que isso vira uma segunda barra de filtros. */
export const MAX_SAVED_VIEWS = 8
const NOME_MAX = 40

const chave = (pessoa: string, projeto: string) =>
  `pds.web.trabalho.vistas-salvas.${pessoa}.${projeto}`

function ler(pessoa: string, projeto: string): VistaSalva[] {
  try {
    const bruto = window.localStorage.getItem(chave(pessoa, projeto))
    const lista: unknown = bruto ? JSON.parse(bruto) : []
    if (!Array.isArray(lista)) return []
    return lista
      .filter(
        (item): item is VistaSalva =>
          typeof item?.nome === 'string' &&
          item.nome.trim() !== '' &&
          typeof item?.consulta === 'string',
      )
      .slice(0, MAX_SAVED_VIEWS)
  } catch {
    return []
  }
}

/** A vista que a consulta guardada descreve; a sem filtro nenhum e a tela de sempre. */
function vistaDe(consulta: string): WorkView {
  return (
    workViewFromQuery(consulta) ?? { filters: NO_REPORT_FILTERS, list: NO_LIST_FILTERS, sort: null }
  )
}

/**
 * As vistas salvas de quem olha, por projeto: **preferencia de quem olha**, e nao regra
 * do projeto — "Meus vencidos" de uma pessoa nao aparece para o time. Neste navegador
 * (`localStorage`), por pessoa: duas pessoas no mesmo computador nao veem as vistas
 * uma da outra. O navegador pode negar o armazenamento, e ai a vista vale ate sair.
 */
function useVistasSalvas(pessoa: string, projeto: string) {
  const [estado, setEstado] = useState(() => ({
    dono: `${pessoa}|${projeto}`,
    lista: ler(pessoa, projeto),
  }))
  const dono = `${pessoa}|${projeto}`
  const vistas = estado.dono === dono ? estado.lista : ler(pessoa, projeto)
  if (estado.dono !== dono) setEstado({ dono, lista: vistas })

  const gravar = useCallback(
    (proxima: VistaSalva[]) => {
      setEstado({ dono: `${pessoa}|${projeto}`, lista: proxima })
      try {
        if (proxima.length === 0) window.localStorage.removeItem(chave(pessoa, projeto))
        else window.localStorage.setItem(chave(pessoa, projeto), JSON.stringify(proxima))
      } catch {
        // Sem onde guardar, a vista vale ate sair da tela.
      }
    },
    [pessoa, projeto],
  )
  return [vistas, gravar] as const
}

/**
 * "Salvar vista" e as vistas salvas, em pilulas ao lado das abas: um clique aplica os
 * filtros e a ordem de uma vez; o "×" apaga. A pilula da vista que esta na tela fica
 * pressionada. Salvar pede so o nome, ali mesmo.
 */
export function SavedViews({
  projectPublicId,
  pessoa,
  atual,
  aoAplicar,
}: {
  projectPublicId: string
  /** Quem olha: as vistas sao dela. */
  pessoa: string
  /** A vista que esta na tela. */
  atual: WorkView
  aoAplicar: (vista: WorkView) => void
}) {
  const [vistas, gravar] = useVistasSalvas(pessoa, projectPublicId)
  const [nomeando, setNomeando] = useState(false)
  const [nome, setNome] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  const botao = useRef<HTMLButtonElement>(null)

  // O campo do nome recebe o foco ao abrir: quem clicou em "Salvar vista" vai digitar.
  useEffect(() => {
    if (nomeando) campo.current?.focus()
  }, [nomeando])

  const consulta = workViewToQuery(atual)
  const jaSalva = vistas.some((vista) => sameWorkView(vistaDe(vista.consulta), atual))
  // So ha o que salvar com algum filtro ou outra ordem: a tela de sempre ja e a de sempre.
  const podeSalvar = consulta !== '' && !jaSalva && vistas.length < MAX_SAVED_VIEWS

  const cancelar = () => {
    setNomeando(false)
    setNome('')
    // O botao volta no lugar do campo: o foco vai para ele, e nao para o comeco da pagina.
    requestAnimationFrame(() => botao.current?.focus())
  }

  const salvar = (evento: FormEvent) => {
    evento.preventDefault()
    const limpo = nome.trim().slice(0, NOME_MAX)
    if (!limpo) return
    // O mesmo nome troca a vista antiga: dois "Meus" lado a lado nao se distinguem.
    gravar([...vistas.filter((vista) => vista.nome !== limpo), { nome: limpo, consulta }])
    setNomeando(false)
    setNome('')
  }

  if (vistas.length === 0 && !podeSalvar && !nomeando) return null

  return (
    // biome-ignore lint/a11y/useSemanticElements: um grupo de botoes, e nao um formulario: `fieldset` diria a quem usa leitor de tela que ha campos ali
    <div
      role="group"
      aria-label="Vistas salvas"
      className="ml-auto flex min-w-0 items-center gap-1.5 overflow-x-auto py-1"
    >
      {vistas.map((vista) => {
        const ativa = sameWorkView(vistaDe(vista.consulta), atual)
        return (
          <span
            key={vista.nome}
            className={cn(
              'flex h-7 flex-none items-center rounded-full border text-detail transition-colors',
              ativa ? 'border-accent bg-accent/8 text-fg' : 'border-border text-fg-muted',
            )}
          >
            <button
              type="button"
              aria-pressed={ativa}
              onClick={() => aoAplicar(vistaDe(vista.consulta))}
              title={`Aplicar a vista ${vista.nome}`}
              className="h-full max-w-40 truncate rounded-l-full pr-1 pl-3 hover:text-fg"
            >
              {vista.nome}
            </button>
            <button
              type="button"
              aria-label={`Apagar a vista ${vista.nome}`}
              title="Apagar a vista"
              onClick={() => gravar(vistas.filter((item) => item.nome !== vista.nome))}
              className="flex h-full items-center rounded-r-full pr-2 pl-1 hover:text-fg"
            >
              <span aria-hidden>×</span>
            </button>
          </span>
        )
      })}

      {nomeando ? (
        <form onSubmit={salvar} className="flex flex-none items-center gap-1.5">
          <input
            ref={campo}
            aria-label="Nome da vista"
            value={nome}
            maxLength={NOME_MAX}
            onChange={(evento) => setNome(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Escape') {
                evento.preventDefault()
                cancelar()
              }
            }}
            placeholder="Nome da vista"
            className="h-7 w-36 rounded-lg border border-border bg-surface-raised px-2 text-detail text-fg placeholder:text-fg-placeholder"
          />
          <button
            type="submit"
            disabled={nome.trim() === ''}
            className="h-7 rounded-lg px-2 font-medium text-detail text-fg hover:bg-surface-sunken disabled:opacity-40"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={cancelar}
            className="h-7 rounded-lg px-2 text-detail text-fg-muted hover:bg-surface-sunken hover:text-fg"
          >
            Cancelar
          </button>
        </form>
      ) : (
        podeSalvar && (
          <button
            ref={botao}
            type="button"
            onClick={() => setNomeando(true)}
            title="Guarda os filtros e a ordem de agora com um nome, só para você"
            className="flex h-7 flex-none items-center gap-1 rounded-full border border-border border-dashed px-3 text-detail text-fg-muted hover:bg-surface-sunken hover:text-fg"
          >
            <span aria-hidden>+</span> Salvar vista
          </button>
        )
      )}
    </div>
  )
}
