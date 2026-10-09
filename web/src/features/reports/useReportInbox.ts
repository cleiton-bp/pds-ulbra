import { useCallback, useEffect, useRef, useState } from 'react'
import { type ReportSummaryViewModel, WITHOUT_STATE_FILTER } from '@/contracts'
import type { ReportFilters, ReportListOptions } from '@/data'
import { projectReportService } from '@/data'

interface InboxState {
  /** `null` enquanto carrega a primeira pagina e quando ela falha. */
  reports: ReportSummaryViewModel[] | null
  /** Quantos o projeto tem, e nao quantos ja vieram. */
  total: number
  failed: boolean
  loadingMore: boolean
  /**
   * Relendo com outro filtro ou outra ordem, com a lista de antes ainda na tela: a
   * tela a esmaece e diz "Buscando…" — sem isso, a lista velha parecia o resultado.
   */
  refreshing: boolean
}

const EMPTY: InboxState = {
  reports: null,
  total: 0,
  failed: false,
  loadingMore: false,
  refreshing: false,
}

/** O que so a lista pede: as colunas marcadas, a sprint e a ordem escolhida. */
export type InboxListOptions = Pick<ReportListOptions, 'columns' | 'sprint' | 'sort'>

/**
 * A lista de relatos que cresce por partes, dentro de um recorte.
 *
 * Nao usa `useAsyncResource` porque ali cada busca **substitui** o que havia, e
 * aqui a segunda pagina precisa somar a primeira. O resto do comportamento e o
 * mesmo, inclusive o contador de geracao: trocar de projeto dispara uma busca sem
 * cancelar a anterior, e sem ele a resposta do projeto que a pessoa acabou de
 * deixar chega depois e pinta relato de um projeto no endereco de outro.
 */
export function useReportInbox(
  publicId: string,
  stateFilter?: string | null,
  archived = false,
  /** Fora da vista da lista, nada e lido — e, ao voltar para ela, a lista e lida de novo. */
  enabled = true,
  /**
   * Os filtros da tela de Trabalho, e a chave deles: a lista e lida de novo quando a
   * chave muda — **sem esvaziar**, e com a pagina de volta a primeira.
   */
  filters?: ReportFilters,
  filtersKey = '',
  /**
   * As colunas, a sprint e a ordem da lista. Entram na leitura pela referencia: a
   * `filtersKey` de quem chama ja muda quando elas mudam.
   */
  listOptions?: InboxListOptions,
) {
  const [state, setState] = useState<InboxState>(EMPTY)
  const filtros = useRef(filters)
  filtros.current = filters
  const extras = useRef(listOptions)
  extras.current = listOptions
  /** O estado de agora, para quem le tudo de uma vez somar ao que ja esta na tela. */
  const agora = useRef(state)
  agora.current = state
  /** A leitura com os filtros de agora — e sem o argumento, quando nao ha nenhum. */
  const ler = useCallback(
    (pagina: number) => {
      const atuais = filtros.current
      const mais = extras.current
      const opcoes: ReportListOptions = {
        ...(filtersKey && atuais ? { filters: atuais } : {}),
        ...(mais?.columns?.length ? { columns: mais.columns } : {}),
        ...(mais?.sprint ? { sprint: mais.sprint } : {}),
        ...(mais?.sort ? { sort: mais.sort } : {}),
      }
      return Object.keys(opcoes).length > 0
        ? projectReportService.listReports(publicId, pagina, stateFilter, archived, opcoes)
        : projectReportService.listReports(publicId, pagina, stateFilter, archived)
    },
    [publicId, stateFilter, archived, filtersKey],
  )

  const generation = useRef(0)
  const nextPage = useRef(1)
  /**
   * Quantas vezes a lista mudou nesta tela sem ser lida — um card criado, um card
   * mudado pelo dialogo, uma pagina a mais. A releitura que estava no ar quando ela
   * mudou pode ter sido feita antes, e nao passa por cima: le de novo.
   */
  const mexidas = useRef(0)
  /** A ultima releitura pedida. So ela vale quando chega. */
  const ultimaReleitura = useRef(0)

  // O recorte entra na dependencia junto com o projeto: trocar de coluna e comecar
  // uma lista nova, e nao acrescentar a que esta na tela. O contador de geracao
  // cuida do resto — a resposta da coluna que a pessoa acabou de deixar chega
  // depois, e sem ele pintaria relato de uma coluna debaixo do nome de outra.
  //
  // **So o filtro mudou** (a busca, um responsavel): a lista que esta na tela fica
  // ate a nova chegar. Esvaziar a cada palavra digitada piscaria a tela inteira.
  const recorte = `${publicId}|${stateFilter ?? ''}|${archived}`
  const recorteLido = useRef<string | null>(null)
  const load = useCallback(async () => {
    const minha = ++generation.current
    nextPage.current = 1
    const soOFiltro = recorteLido.current === recorte
    recorteLido.current = recorte
    if (!soOFiltro) setState(EMPTY)
    else setState((current) => ({ ...current, refreshing: current.reports !== null }))

    try {
      const page = await ler(1)
      if (minha !== generation.current) return

      nextPage.current = 2
      setState({
        reports: page.reports,
        total: page.total,
        failed: false,
        loadingMore: false,
        refreshing: false,
      })
    } catch {
      // A mensagem e da tela: este arquivo nao sabe o que ela vai dizer.
      if (minha !== generation.current) return
      setState({ ...EMPTY, failed: true })
    }
  }, [ler, recorte])

  useEffect(() => {
    if (enabled) void load()
  }, [load, enabled])

  const loadMore = useCallback(async () => {
    const minha = generation.current
    setState((current) => ({ ...current, loadingMore: true }))

    try {
      const page = await ler(nextPage.current)
      if (minha !== generation.current) return

      nextPage.current += 1
      mexidas.current += 1

      setState((current) => ({
        ...current,
        reports: merge(current.reports ?? [], page.reports),
        // O total vem da resposta mais recente: relato novo entrando enquanto se
        // le muda o numero, e manter o antigo faria o botao sumir cedo demais.
        total: page.total,
        failed: false,
        loadingMore: false,
      }))
    } catch (error) {
      if (minha !== generation.current) return

      setState((current) => ({ ...current, loadingMore: false }))

      // Devolve o erro original em vez de um proprio: a tela mostra a mensagem
      // que a API escreveu, e trocar por um texto generico aqui apagaria ela.
      throw error
    }
  }, [ler])

  /**
   * Rele **sem esvaziar** as paginas que estao na tela — e troca tudo de uma vez quando
   * a ultima chega. E o que o tempo real usa: outra pessoa mudou um card, e a lista se
   * acerta sem piscar e sem voltar a primeira pagina de quem estava na terceira.
   *
   * A pagina e por posicao, e uma pagina relida pode trazer de novo um card da anterior
   * (alguem entrou no topo): o `merge` tira a repeticao. Falhando, fica o que esta na
   * tela — o proximo aviso tenta de novo. **Duas no ar, vale a ultima**; e a lista que
   * mudou aqui no meio do caminho — "Carregar mais", um card criado — e lida de novo:
   * a troca descartaria a mudanca. Devolve a lista que foi para a tela, ou nulo quando
   * nada foi.
   */
  const refresh = useCallback(async (): Promise<ReportSummaryViewModel[] | null> => {
    const minha = generation.current
    const esta = ++ultimaReleitura.current
    const valendo = () => minha === generation.current && esta === ultimaReleitura.current

    for (;;) {
      const mexidaAntes = mexidas.current
      const paginas = Math.max(1, nextPage.current - 1)
      let reports: ReportSummaryViewModel[] = []
      let total = 0

      try {
        for (let pagina = 1; pagina <= paginas; pagina++) {
          const lida = await ler(pagina)
          if (!valendo()) return null
          reports = merge(reports, lida.reports)
          total = lida.total
          if (lida.reports.length === 0) break
        }
      } catch {
        // Fica o que esta na tela.
        return null
      }

      if (mexidas.current !== mexidaAntes) continue

      setState((current) =>
        current.reports === null ? current : { ...current, reports, total, failed: false },
      )
      return reports
    }
  }, [ler])

  /**
   * Le todas as paginas que faltam, e devolve a lista inteira — o "Selecionar os N que
   * passam nos filtros" do lote. Nulo quando a lista mudou de recorte no meio do caminho.
   */
  const loadAll = useCallback(async (): Promise<ReportSummaryViewModel[] | null> => {
    const minha = generation.current
    setState((current) => ({ ...current, loadingMore: true }))
    let novos: ReportSummaryViewModel[] = []
    let total = agora.current.total
    let ja = agora.current.reports?.length ?? 0

    try {
      while (ja + novos.length < total) {
        const page = await ler(nextPage.current)
        if (minha !== generation.current) return null
        nextPage.current += 1
        mexidas.current += 1
        novos = merge(novos, page.reports)
        total = page.total
        if (page.reports.length === 0) break
        ja = agora.current.reports?.length ?? 0
      }
    } catch (error) {
      if (minha === generation.current) setState((current) => ({ ...current, loadingMore: false }))
      throw error
    }

    const inteira = merge(agora.current.reports ?? [], novos)
    setState((current) => ({
      ...current,
      reports: inteira,
      total,
      failed: false,
      loadingMore: false,
    }))
    return inteira
  }, [ler])

  /**
   * Se o card pertence a esta lista: a coluna do recorte — ou uma das colunas
   * marcadas —, e o lado do arquivo.
   */
  const fits = useCallback(
    (report: ReportSummaryViewModel) => {
      const colunas = extras.current?.columns ?? []
      return (
        (report.ArchivedAt !== null) === archived &&
        (!stateFilter ||
          (stateFilter === WITHOUT_STATE_FILTER
            ? report.StatePublicId === null
            : report.StatePublicId === stateFilter)) &&
        (colunas.length === 0 || colunas.includes(report.StatePublicId ?? WITHOUT_STATE_FILTER))
      )
    },
    [stateFilter, archived],
  )

  /**
   * Troca um relato que acabou de mudar, sem refazer a busca.
   *
   * **E ele quem tira da lista o relato que saiu do recorte.** Movido para outra
   * coluna com um filtro ligado, ele deixa de pertencer aquela lista — deixa-lo
   * ali faria a tela mostrar, debaixo do nome de uma coluna, um relato que nao
   * esta mais nela.
   *
   * Recarregar tudo resolveria igual e custaria a paginacao: quem estava na
   * pagina tres voltaria para a primeira a cada relato movido.
   */
  const apply = useCallback(
    (report: ReportSummaryViewModel) => {
      mexidas.current += 1
      setState((current) => {
        if (current.reports === null) return current

        // Arquivar tambem tira da lista — e desarquivar tira da lista dos arquivados.
        return fits(report)
          ? {
              ...current,
              reports: current.reports.map((item) =>
                item.PublicId === report.PublicId ? report : item,
              ),
            }
          : {
              ...current,
              reports: current.reports.filter((item) => item.PublicId !== report.PublicId),
              total: Math.max(0, current.total - 1),
            }
      })
    },
    [fits],
  )

  /**
   * Poe no topo o card que acabou de ser criado, se ele pertence a esta lista. E o
   * mais novo, e a lista vai do mais novo para o mais antigo.
   */
  const prepend = useCallback(
    (report: ReportSummaryViewModel) => {
      mexidas.current += 1
      setState((current) =>
        current.reports === null || !fits(report)
          ? current
          : { ...current, reports: [report, ...current.reports], total: current.total + 1 },
      )
    },
    [fits],
  )

  return {
    reports: state.reports,
    total: state.total,
    loading: state.reports === null && !state.failed,
    failed: state.failed,
    loadingMore: state.loadingMore,
    refreshing: state.refreshing,
    /** Ha mais para carregar do que ja esta na tela. */
    hasMore: state.reports !== null && state.reports.length < state.total,
    reload: () => void load(),
    refresh,
    loadMore,
    loadAll,
    apply,
    prepend,
  }
}

/**
 * Junta a pagina nova a que ja estava, sem repetir.
 *
 * A paginacao e por posicao, entao um relato que entra entre uma pagina e a
 * seguinte empurra todos para baixo e o ultimo da primeira volta como primeiro da
 * segunda. Sem isto, ele apareceria duas vezes — e com a mesma chave no React.
 */
function merge(
  current: ReportSummaryViewModel[],
  incoming: ReportSummaryViewModel[],
): ReportSummaryViewModel[] {
  const known = new Set(current.map((report) => report.PublicId))
  return [...current, ...incoming.filter((report) => !known.has(report.PublicId))]
}
