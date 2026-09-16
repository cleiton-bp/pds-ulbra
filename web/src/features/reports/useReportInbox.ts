import { useCallback, useEffect, useRef, useState } from 'react'
import { type ReportSummaryViewModel, WITHOUT_STATE_FILTER } from '@/contracts'
import { projectReportService } from '@/data'

interface InboxState {
  /** `null` enquanto carrega a primeira pagina e quando ela falha. */
  reports: ReportSummaryViewModel[] | null
  /** Quantos o projeto tem, e nao quantos ja vieram. */
  total: number
  failed: boolean
  loadingMore: boolean
}

const EMPTY: InboxState = { reports: null, total: 0, failed: false, loadingMore: false }

/**
 * A lista de relatos que cresce por partes, dentro de um recorte.
 *
 * Nao usa `useAsyncResource` porque ali cada busca **substitui** o que havia, e
 * aqui a segunda pagina precisa somar a primeira. O resto do comportamento e o
 * mesmo, inclusive o contador de geracao: trocar de projeto dispara uma busca sem
 * cancelar a anterior, e sem ele a resposta do projeto que a pessoa acabou de
 * deixar chega depois e pinta relato de um projeto no endereco de outro.
 */
export function useReportInbox(publicId: string, stateFilter?: string | null) {
  const [state, setState] = useState<InboxState>(EMPTY)

  const generation = useRef(0)
  const nextPage = useRef(1)

  // O recorte entra na dependencia junto com o projeto: trocar de coluna e comecar
  // uma lista nova, e nao acrescentar a que esta na tela. O contador de geracao
  // cuida do resto — a resposta da coluna que a pessoa acabou de deixar chega
  // depois, e sem ele pintaria relato de uma coluna debaixo do nome de outra.
  const load = useCallback(async () => {
    const minha = ++generation.current
    nextPage.current = 1
    setState(EMPTY)

    try {
      const page = await projectReportService.listReports(publicId, 1, stateFilter)
      if (minha !== generation.current) return

      nextPage.current = 2
      setState({ reports: page.reports, total: page.total, failed: false, loadingMore: false })
    } catch {
      // A mensagem e da tela: este arquivo nao sabe o que ela vai dizer.
      if (minha !== generation.current) return
      setState({ ...EMPTY, failed: true })
    }
  }, [publicId, stateFilter])

  useEffect(() => {
    void load()
  }, [load])

  const loadMore = useCallback(async () => {
    const minha = generation.current
    setState((current) => ({ ...current, loadingMore: true }))

    try {
      const page = await projectReportService.listReports(publicId, nextPage.current, stateFilter)
      if (minha !== generation.current) return

      nextPage.current += 1

      setState((current) => ({
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
  }, [publicId, stateFilter])

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
      setState((current) => {
        if (current.reports === null) return current

        const cabe =
          !stateFilter ||
          (stateFilter === WITHOUT_STATE_FILTER
            ? report.StatePublicId === null
            : report.StatePublicId === stateFilter)

        return cabe
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
    [stateFilter],
  )

  return {
    reports: state.reports,
    total: state.total,
    loading: state.reports === null && !state.failed,
    failed: state.failed,
    loadingMore: state.loadingMore,
    /** Ha mais para carregar do que ja esta na tela. */
    hasMore: state.reports !== null && state.reports.length < state.total,
    reload: () => void load(),
    loadMore,
    apply,
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
