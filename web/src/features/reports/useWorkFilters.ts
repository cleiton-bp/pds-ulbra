import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  NO_REPORT_FILTERS,
  type ReportFilters,
  type ReportFilterType,
  type ReportSort,
  type ReportSortField,
} from '@/data'

/** Quanto a busca espera depois da ultima tecla: uma leitura por palavra, e nao por letra. */
export const SEARCH_DELAY_MS = 300

const TIPOS: ReportFilterType[] = ['bug', 'improvement', 'question', 'team']

const chave = (projeto: string) => `pds.web.trabalho.filtros.${projeto}`
const chaveDaOrdem = (projeto: string) => `pds.web.trabalho.ordem.${projeto}`

/**
 * O que so a lista recorta: as colunas e a sprint. **Fora dos filtros do quadro**: no
 * quadro cada coluna ja esta na tela, e a sprint dele e a em andamento — e a contagem
 * das colunas nao recebe as colunas, senao cada coluna desmarcada contaria zero no
 * proprio menu.
 */
export interface ListFilters {
  /** As colunas marcadas: o identificador, ou `WITHOUT_STATE_FILTER`. */
  columns: string[]
  /** `backlog` ou o identificador de uma sprint; nulo e sem este filtro. */
  sprint: string | null
}

export const NO_LIST_FILTERS: ListFilters = { columns: [], sprint: null }

/** Os dados por que a tabela ordena. */
const CAMPOS: ReportSortField[] = [
  'number',
  'state',
  'assignee',
  'priority',
  'due',
  'created',
  'updated',
]

/**
 * A direcao do primeiro clique em cada cabecalho: a que responde a pergunta de quem
 * clica — o que vence primeiro, o mais urgente, o mais novo, o que mudou agora.
 */
export const FIRST_SORT_DIR: Record<ReportSortField, ReportSort['dir']> = {
  number: 'asc',
  state: 'asc',
  assignee: 'asc',
  priority: 'desc',
  due: 'asc',
  created: 'desc',
  updated: 'desc',
}

/**
 * O que veio guardado, conferido campo a campo: o `sessionStorage` e de quem usa o
 * navegador, e um valor estranho nao pode derrubar a tela nem virar filtro que
 * ninguem pediu.
 */
function lerGuardados(projeto: string): { filtros: ReportFilters; lista: ListFilters } {
  try {
    const bruto = window.sessionStorage.getItem(chave(projeto))
    if (!bruto) return { filtros: NO_REPORT_FILTERS, lista: NO_LIST_FILTERS }
    const valor = JSON.parse(bruto) as Partial<
      Record<keyof ReportFilters | keyof ListFilters, unknown>
    >
    const textos = (lista: unknown) =>
      Array.isArray(lista) ? lista.filter((item): item is string => typeof item === 'string') : []
    return {
      filtros: {
        assignees: textos(valor.assignees),
        labels: textos(valor.labels),
        priorities: textos(valor.priorities),
        types: textos(valor.types).filter((tipo): tipo is ReportFilterType =>
          TIPOS.includes(tipo as ReportFilterType),
        ),
        overdue: valor.overdue === true,
        open: valor.open === true,
        hideSubtasks: valor.hideSubtasks === true,
        search: typeof valor.search === 'string' ? valor.search : '',
      },
      lista: {
        columns: textos(valor.columns),
        sprint: typeof valor.sprint === 'string' && valor.sprint ? valor.sprint : null,
      },
    }
  } catch {
    return { filtros: NO_REPORT_FILTERS, lista: NO_LIST_FILTERS }
  }
}

function guardar(projeto: string, filtros: ReportFilters, lista: ListFilters) {
  try {
    if (countActiveFilters(filtros) + countListFilters(lista) === 0)
      window.sessionStorage.removeItem(chave(projeto))
    else window.sessionStorage.setItem(chave(projeto), JSON.stringify({ ...filtros, ...lista }))
  } catch {
    // Sem armazenamento (aba privada, bloqueio): os filtros so nao ficam lembrados.
  }
}

/** A ordem guardada, conferida como os filtros. Nula e a de sempre: o mais novo primeiro. */
function lerOrdem(projeto: string): ReportSort | null {
  try {
    const bruto = window.sessionStorage.getItem(chaveDaOrdem(projeto))
    if (!bruto) return null
    const valor = JSON.parse(bruto) as Partial<Record<keyof ReportSort, unknown>>
    const campo = CAMPOS.find((item) => item === valor.field)
    if (!campo || (valor.dir !== 'asc' && valor.dir !== 'desc')) return null
    return { field: campo, dir: valor.dir }
  } catch {
    return null
  }
}

function guardarOrdem(projeto: string, ordem: ReportSort | null) {
  try {
    if (ordem === null) window.sessionStorage.removeItem(chaveDaOrdem(projeto))
    else window.sessionStorage.setItem(chaveDaOrdem(projeto), JSON.stringify(ordem))
  } catch {
    // Sem armazenamento, a ordem vale ate sair da tela.
  }
}

/** Quantos filtros estao ligados — cada um conta uma vez, com quantos valores tiver. */
export function countActiveFilters(filtros: ReportFilters): number {
  return (
    (filtros.assignees.length > 0 ? 1 : 0) +
    (filtros.labels.length > 0 ? 1 : 0) +
    (filtros.priorities.length > 0 ? 1 : 0) +
    (filtros.types.length > 0 ? 1 : 0) +
    (filtros.overdue ? 1 : 0) +
    (filtros.open ? 1 : 0) +
    (filtros.hideSubtasks ? 1 : 0) +
    (filtros.search.trim() ? 1 : 0)
  )
}

/** Quantos dos filtros so da lista estao ligados. */
export function countListFilters(lista: ListFilters): number {
  return (lista.columns.length > 0 ? 1 : 0) + (lista.sprint ? 1 : 0)
}

/**
 * Os filtros da tela de Trabalho de um projeto, e a ordem da tabela.
 *
 * **Lembrados na aba, por projeto** (`sessionStorage`): sobrevivem a ir a
 * Configuracao e voltar, ou recarregar a pagina; somem ao fechar a aba — um filtro
 * esquecido de ontem faria a pessoa achar que cards sumiram. As colunas e a sprint da
 * lista vao junto, e o "Limpar filtros" as limpa tambem; a ordem e lembrada a parte, e
 * fica — ordem nao e filtro, e nao esconde card nenhum.
 *
 * `filters` e o que esta na tela agora; `applied`, o que vale para as leituras — o
 * mesmo, com a busca esperando a pessoa parar de digitar. `key` muda so quando o que
 * vale muda, e e o que as leituras do quadro e da contagem olham — **vazia quando nada
 * do que vale esta ligado**: a busca que ainda espera a pessoa parar de digitar nao e
 * filtro ainda. `listKey` e a da lista: a mesma, mais as colunas, a sprint e a ordem.
 */
export function useWorkFilters(projectPublicId: string) {
  const [estado, setEstado] = useState(() => ({
    projeto: projectPublicId,
    ...lerGuardados(projectPublicId),
    ordem: lerOrdem(projectPublicId),
  }))
  const [busca, setBusca] = useState(estado.filtros.search)

  // Trocar de projeto le os filtros dele — a busca junto, sem esperar —, antes de
  // qualquer leitura com os do outro. A coluna de um projeto nao existe no outro.
  const atual =
    estado.projeto === projectPublicId
      ? estado
      : {
          projeto: projectPublicId,
          ...lerGuardados(projectPublicId),
          ordem: lerOrdem(projectPublicId),
        }
  if (estado.projeto !== projectPublicId) {
    setEstado(atual)
    setBusca(atual.filtros.search)
  }
  const filters = atual.filtros
  const list = atual.lista
  const sort = atual.ordem

  useEffect(() => {
    if (filters.search === busca) return
    // Apagar a busca vale na hora: esperar para mostrar tudo de novo nao ajuda ninguem.
    if (!filters.search.trim()) {
      setBusca(filters.search)
      return
    }
    const espera = setTimeout(() => setBusca(filters.search), SEARCH_DELAY_MS)
    return () => clearTimeout(espera)
  }, [filters.search, busca])

  const setFilters = useCallback(
    (proximo: ReportFilters | ((atual: ReportFilters) => ReportFilters)) => {
      setEstado((antes) => {
        const filtros = typeof proximo === 'function' ? proximo(antes.filtros) : proximo
        guardar(antes.projeto, filtros, antes.lista)
        return { ...antes, filtros }
      })
    },
    [],
  )

  const setList = useCallback((proximo: ListFilters | ((atual: ListFilters) => ListFilters)) => {
    setEstado((antes) => {
      const lista = typeof proximo === 'function' ? proximo(antes.lista) : proximo
      guardar(antes.projeto, antes.filtros, lista)
      return { ...antes, lista }
    })
  }, [])

  /**
   * Ordena por um dado: o primeiro clique na direcao que responde a pergunta de quem
   * clicou, o segundo inverte. Voltar ao "mais novo primeiro" e voltar a ordem de
   * sempre, e ela nao fica guardada.
   */
  const sortBy = useCallback((campo: ReportSortField) => {
    setEstado((antes) => {
      const vigente: ReportSort = antes.ordem ?? { field: 'created', dir: 'desc' }
      const dir: ReportSort['dir'] =
        vigente.field === campo ? (vigente.dir === 'asc' ? 'desc' : 'asc') : FIRST_SORT_DIR[campo]
      const ordem = campo === 'created' && dir === 'desc' ? null : { field: campo, dir }
      guardarOrdem(antes.projeto, ordem)
      return { ...antes, ordem }
    })
  }, [])

  /** A ordem escolhida no menu; nula volta a de sempre. */
  const setSort = useCallback((ordem: ReportSort | null) => {
    setEstado((antes) => {
      guardarOrdem(antes.projeto, ordem)
      return { ...antes, ordem }
    })
  }, [])

  const clear = useCallback(() => {
    setEstado((antes) => {
      guardar(antes.projeto, NO_REPORT_FILTERS, NO_LIST_FILTERS)
      return { ...antes, filtros: NO_REPORT_FILTERS, lista: NO_LIST_FILTERS }
    })
    setBusca('')
  }, [])

  const applied = useMemo<ReportFilters>(() => ({ ...filters, search: busca }), [filters, busca])
  const key = useMemo(
    () =>
      countActiveFilters(applied) === 0
        ? ''
        : JSON.stringify({
            ...applied,
            assignees: [...applied.assignees].sort(),
            labels: [...applied.labels].sort(),
            priorities: [...applied.priorities].sort(),
            types: [...applied.types].sort(),
            search: applied.search.trim(),
          }),
    [applied],
  )
  const listKey = useMemo(
    () =>
      countListFilters(list) === 0 && sort === null
        ? key
        : JSON.stringify({
            key,
            columns: [...list.columns].sort(),
            sprint: list.sprint,
            sort,
          }),
    [key, list, sort],
  )

  return {
    filters,
    applied,
    key,
    list,
    listKey,
    sort,
    sortBy,
    setSort,
    /** Os filtros ligados: os da tela toda e os so da lista. */
    active: countActiveFilters(filters) + countListFilters(list),
    /** So os que valem no quadro tambem — o que o "Limpar filtros" do quadro diz. */
    activeShared: countActiveFilters(filters),
    /** A busca digitada que ainda nao virou leitura: a pessoa nao parou de digitar. */
    typing: filters.search.trim() !== busca.trim(),
    setFilters,
    setList,
    clear,
  }
}
