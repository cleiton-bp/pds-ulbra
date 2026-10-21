import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  NO_REPORT_FILTERS,
  type ReportFilters,
  type ReportSort,
  type ReportSortField,
  TEAM_CARD_FILTER,
} from '@/data'

/** Quanto a busca espera depois da ultima tecla: uma leitura por palavra, e nao por letra. */
export const SEARCH_DELAY_MS = 300

/**
 * Um valor que o filtro de tipo aceita: o identificador de um tipo do projeto, ou o
 * card do time. **Os nomes antigos (`bug`, `improvement`, `question`) caem aqui**: a
 * aba que guardou o filtro antes de os tipos serem do projeto nao manda para a API um
 * valor que ela recusa. O tipo que nao existe mais sai depois, quando o menu le a lista.
 */
const ehTipo = (valor: string) =>
  valor === TEAM_CARD_FILTER ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)

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
        types: textos(valor.types).filter(ehTipo),
        overdue: valor.overdue === true,
        open: valor.open === true,
        blockedOrigin: valor.blockedOrigin === true,
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

/**
 * Abre a tela de Trabalho, na proxima vez, so com os cards marcados com a origem
 * bloqueada — o "Revisar na lista" da tela de Dominios. **Pelo mesmo lugar em que os
 * filtros ja sao lembrados**: a tela de Trabalho le dali ao abrir, e nao ha outro
 * caminho para mudar o filtro de uma tela que ainda nao esta montada. Os outros
 * filtros saem: a pessoa vai revisar os marcados, e um filtro esquecido esconderia
 * metade deles.
 */
export function rememberBlockedOriginFilter(projeto: string): void {
  guardar(projeto, { ...NO_REPORT_FILTERS, blockedOrigin: true }, NO_LIST_FILTERS)
  // E na lista, que e onde mora o lote: a mesma chave da vista lembrada da tela.
  try {
    window.localStorage.setItem(`pds.web.trabalho.vista.${projeto}`, 'lista')
  } catch {
    // Sem onde guardar, a tela abre na vista de sempre — o filtro vale nela tambem.
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
    (filtros.blockedOrigin ? 1 : 0) +
    (filtros.search.trim() ? 1 : 0)
  )
}

/** Quantos dos filtros so da lista estao ligados. */
export function countListFilters(lista: ListFilters): number {
  return (lista.columns.length > 0 ? 1 : 0) + (lista.sprint ? 1 : 0)
}

/**
 * O que a tela de Trabalho mostra, junto: os filtros, os so da lista e a ordem. E o que
 * vai para o endereco e o que uma vista salva guarda.
 */
export interface WorkView {
  filters: ReportFilters
  list: ListFilters
  sort: ReportSort | null
}

/**
 * Os nomes no endereco, em portugues como a tela: o link que alguem cola no chat
 * (`?responsavel=me&vencidos=1`) diz o que mostra antes de abrir.
 */
const NO_ENDERECO = {
  busca: 'q',
  responsavel: 'responsavel',
  etiqueta: 'etiqueta',
  prioridade: 'prioridade',
  tipo: 'tipo',
  vencidos: 'vencidos',
  abertos: 'em-aberto',
  bloqueada: 'origem-bloqueada',
  coluna: 'coluna',
  sprint: 'sprint',
  ordem: 'ordem',
} as const
const PARAMETROS: readonly string[] = Object.values(NO_ENDERECO)

/** A busca nao passa do que o campo aceita: o endereco tambem e de quem o escreve. */
const BUSCA_MAX = 200

/**
 * A vista que o endereco descreve, conferida como o que vem guardado: o endereco e de
 * quem o escreve, e um valor estranho nao vira filtro. Nula quando o endereco nao fala
 * de filtro nenhum — ai vale o que a aba lembrou.
 */
export function workViewFromQuery(search: string): WorkView | null {
  const params = new URLSearchParams(search)
  if (!PARAMETROS.some((nome) => params.has(nome))) return null
  const varios = (nome: string) =>
    [...new Set(params.getAll(nome).filter((valor) => valor.trim() !== ''))].slice(0, 50)
  const ligado = (nome: string) => {
    const valor = params.get(nome)
    return valor !== null && valor !== '0' && valor !== 'false'
  }
  const [campo, dir] = (params.get(NO_ENDERECO.ordem) ?? '').split('.')
  const ordenado = CAMPOS.find((item) => item === campo)
  return {
    filters: {
      assignees: varios(NO_ENDERECO.responsavel),
      labels: varios(NO_ENDERECO.etiqueta),
      priorities: varios(NO_ENDERECO.prioridade),
      types: varios(NO_ENDERECO.tipo).filter(ehTipo),
      overdue: ligado(NO_ENDERECO.vencidos),
      open: ligado(NO_ENDERECO.abertos),
      blockedOrigin: ligado(NO_ENDERECO.bloqueada),
      search: (params.get(NO_ENDERECO.busca) ?? '').slice(0, BUSCA_MAX),
    },
    list: {
      columns: varios(NO_ENDERECO.coluna),
      sprint: params.get(NO_ENDERECO.sprint) || null,
    },
    // O "mais novo primeiro" e a ordem de sempre: no endereco, e a falta do parametro.
    sort:
      ordenado && (dir === 'asc' || dir === 'desc') && !(ordenado === 'created' && dir === 'desc')
        ? { field: ordenado, dir }
        : null,
  }
}

/**
 * O endereco com a vista: os parametros dos filtros trocados, e os outros (de quem
 * mais usar o endereco) intactos. O que esta desligado sai — o endereco da tela sem
 * filtro e o de sempre. Devolve com o `?`, ou vazio.
 */
export function workViewToQuery(vista: WorkView, search = ''): string {
  const params = new URLSearchParams(search)
  for (const nome of PARAMETROS) params.delete(nome)
  const { filters: f, list: l, sort } = vista
  const busca = f.search.trim()
  if (busca) params.set(NO_ENDERECO.busca, busca)
  for (const valor of f.assignees) params.append(NO_ENDERECO.responsavel, valor)
  for (const valor of f.labels) params.append(NO_ENDERECO.etiqueta, valor)
  for (const valor of f.priorities) params.append(NO_ENDERECO.prioridade, valor)
  for (const valor of f.types) params.append(NO_ENDERECO.tipo, valor)
  if (f.overdue) params.set(NO_ENDERECO.vencidos, '1')
  if (f.open) params.set(NO_ENDERECO.abertos, '1')
  if (f.blockedOrigin) params.set(NO_ENDERECO.bloqueada, '1')
  for (const valor of l.columns) params.append(NO_ENDERECO.coluna, valor)
  if (l.sprint) params.set(NO_ENDERECO.sprint, l.sprint)
  if (sort && !(sort.field === 'created' && sort.dir === 'desc'))
    params.set(NO_ENDERECO.ordem, `${sort.field}.${sort.dir}`)
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

/**
 * Duas vistas iguais no que mostram: a ordem em que os valores foram marcados nao
 * conta — "etiqueta a e b" e "b e a" sao a mesma lista.
 */
export function sameWorkView(a: WorkView, b: WorkView): boolean {
  const ordenada = (vista: WorkView): WorkView => ({
    filters: {
      ...vista.filters,
      assignees: [...vista.filters.assignees].sort(),
      labels: [...vista.filters.labels].sort(),
      priorities: [...vista.filters.priorities].sort(),
      types: [...vista.filters.types].sort(),
    },
    list: { ...vista.list, columns: [...vista.list.columns].sort() },
    sort: vista.sort,
  })
  return workViewToQuery(ordenada(a)) === workViewToQuery(ordenada(b))
}

/**
 * Como a tela abre: **o endereco vence** — o link que alguem mandou mostra o que essa
 * pessoa via —, e o que ele traz passa a ser o lembrado na aba. Sem filtro no
 * endereco, vale o que a aba lembrou.
 */
function lerInicio(projeto: string, endereco?: string) {
  const doEndereco = endereco ? workViewFromQuery(endereco) : null
  if (doEndereco) {
    guardar(projeto, doEndereco.filters, doEndereco.list)
    guardarOrdem(projeto, doEndereco.sort)
    return {
      projeto,
      filtros: doEndereco.filters,
      lista: doEndereco.list,
      ordem: doEndereco.sort,
    }
  }
  return { projeto, ...lerGuardados(projeto), ordem: lerOrdem(projeto) }
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
 *
 * **O endereco vence o lembrado** (`endereco`, o `?` da pagina ao abrir): o link com
 * os filtros reproduz a vista de quem o mandou. A aba continua lembrando, para quem
 * volta a tela por um link sem filtro — ver `useFiltersInAddress`.
 */
export function useWorkFilters(projectPublicId: string, endereco?: string) {
  const [estado, setEstado] = useState(() => lerInicio(projectPublicId, endereco))
  const [busca, setBusca] = useState(estado.filtros.search)

  // Trocar de projeto le os filtros dele — a busca junto, sem esperar —, antes de
  // qualquer leitura com os do outro. A coluna de um projeto nao existe no outro.
  const atual = estado.projeto === projectPublicId ? estado : lerInicio(projectPublicId, endereco)
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

  /**
   * Troca tudo de uma vez — os filtros, os so da lista e a ordem: o link colado, o
   * voltar do navegador, a vista salva. A busca vale na hora, sem esperar: ninguem
   * esta digitando.
   */
  const applyView = useCallback((vista: WorkView) => {
    setEstado((antes) => {
      guardar(antes.projeto, vista.filters, vista.list)
      guardarOrdem(antes.projeto, vista.sort)
      return { ...antes, filtros: vista.filters, lista: vista.list, ordem: vista.sort }
    })
    setBusca(vista.filters.search)
  }, [])

  const applied = useMemo<ReportFilters>(() => ({ ...filters, search: busca }), [filters, busca])
  /** O que vale agora, junto — a busca que ja virou leitura: e o que vai para o endereco. */
  const view = useMemo<WorkView>(() => ({ filters: applied, list, sort }), [applied, list, sort])
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
    view,
    applyView,
  }
}
