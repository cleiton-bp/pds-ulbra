import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReportSummaryViewModel } from '@/contracts'
import {
  NO_REPORT_FILTERS,
  projectReportService,
  type ReportFilters,
  type ReportListOptions,
  type ReportSort,
} from '@/data'
import {
  type ListGroupBy,
  type ListGroupDefinition,
  listGroupKeyOf,
} from '@/features/reports/listGroups'

/** Quantos cards cada bloco mostra de inicio, e quantos cada "Mostrar mais" traz. */
export const LIST_GROUP_PAGE = 15

/** O maior pedaco que a API entrega de uma vez. */
const PAGINA_MAXIMA = 100

interface Bloco {
  reports: ReportSummaryViewModel[]
  total: number
  failed: boolean
  loadingMore: boolean
}

interface Lido {
  projeto: string
  blocos: Record<string, Bloco>
  /** O total sem bloco nenhum, so no agrupamento por responsavel. Ver `outside`. */
  geral: number | null
}

/** Um bloco, pronto para a tabela. */
export interface ListGroupView {
  definition: ListGroupDefinition
  reports: ReportSummaryViewModel[]
  total: number
  failed: boolean
  loadingMore: boolean
  collapsed: boolean
}

/**
 * A lista do Trabalho em blocos: **cada bloco e uma leitura propria**, com os filtros da
 * tela e o recorte dele (a coluna, a pessoa, a prioridade, o tipo), e o total vem junto.
 * Nada e carregado inteiro: cada bloco traz `LIST_GROUP_PAGE` cards, e o "Mostrar mais"
 * dele traz os seguintes.
 *
 * **Fala como a lista de sempre** (`useReportInbox`): a tela recebe as linhas, o total,
 * reler, ler tudo e aplicar uma mudanca, e o lote, o card novo e os avisos ao vivo
 * continuam como estavam. O que muda e so a tabela, que desenha os blocos.
 *
 * **Reler guarda o que cada bloco ja mostrava**: o bloco que estava com 45 cards volta
 * com 45, e nao com 15. Um aviso ao vivo nao desfaz o "Mostrar mais" de ninguem.
 *
 * **Recolher e preferencia de quem olha**, lembrada neste navegador por projeto e por
 * agrupamento. O bloco recolhido continua lido: e assim que o titulo dele diz quantos ha.
 */
export function useGroupedReportList({
  publicId,
  enabled,
  by,
  definitions,
  filters,
  filtersKey,
  sort,
  sprint,
}: {
  publicId: string
  enabled: boolean
  by: ListGroupBy
  /** Nulo enquanto a fonte dos blocos nao chegou. */
  definitions: ListGroupDefinition[] | null
  filters: ReportFilters
  filtersKey: string
  sort: ReportSort | null
  sprint: string | null
}) {
  const [lido, setLido] = useState<Lido | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const geracao = useRef(0)
  const atual = useRef(lido)
  atual.current = lido

  // Tudo o que a leitura usa, pela referencia: os efeitos acordam pela chave, e nao a
  // cada desenho de quem chama.
  const contexto = useRef({ definitions, filters, sort, sprint, by })
  contexto.current = { definitions, filters, sort, sprint, by }

  const ler = useCallback(
    (definicao: ListGroupDefinition | null, pagina: number, tamanho: number) => {
      const { filters: daTela, sort: ordem, sprint: daSprint } = contexto.current
      const opcoes: ReportListOptions = {
        filters: { ...NO_REPORT_FILTERS, ...daTela, ...definicao?.read.filters },
        pageSize: tamanho,
        ...(definicao?.read.columns ? { columns: definicao.read.columns } : {}),
        ...(daSprint ? { sprint: daSprint } : {}),
        ...(ordem ? { sort: ordem } : {}),
      }
      return projectReportService.listReports(publicId, pagina, null, false, opcoes)
    },
    [publicId],
  )

  /** Le todos os blocos, cada um com o tamanho pedido. Nulo se outra leitura passou na frente. */
  const lerTodos = useCallback(
    async (tamanhoDe: (chave: string) => number): Promise<Lido | null> => {
      const minha = ++geracao.current
      const defs = contexto.current.definitions ?? []
      const [respostas, geral] = await Promise.all([
        Promise.all(
          defs.map((definicao) =>
            ler(definicao, 1, tamanhoDe(definicao.key)).then(
              (pagina) => ({ chave: definicao.key, pagina }),
              () => ({ chave: definicao.key, pagina: null }),
            ),
          ),
        ),
        contexto.current.by === 'assignee'
          ? ler(null, 1, 1).then(
              (pagina) => pagina.total,
              () => null,
            )
          : Promise.resolve(null),
      ])
      if (minha !== geracao.current) return null
      const blocos: Record<string, Bloco> = {}
      for (const { chave, pagina } of respostas) {
        const antes = atual.current?.blocos[chave]
        blocos[chave] = pagina
          ? { reports: pagina.reports, total: pagina.total, failed: false, loadingMore: false }
          : // Falhou: fica o que ja estava, marcado, para o "Tentar de novo" do bloco.
            {
              reports: antes?.reports ?? [],
              total: antes?.total ?? 0,
              failed: true,
              loadingMore: false,
            }
      }
      const novo = { projeto: publicId, blocos, geral }
      setLido(novo)
      setRefreshing(false)
      return novo
    },
    [ler, publicId],
  )

  const tamanhoGuardado = useCallback((chave: string) => {
    const mostrados = atual.current?.blocos[chave]?.reports.length ?? 0
    return Math.min(PAGINA_MAXIMA, Math.max(LIST_GROUP_PAGE, mostrados))
  }, [])

  const chaveDosBlocos = definitions?.map((d) => d.key).join('|') ?? null
  const chaveDaOrdem = sort ? `${sort.field}:${sort.dir}` : ''

  // biome-ignore lint/correctness/useExhaustiveDependencies: as chaves resumem os blocos, os filtros e a ordem; lerTodos le o resto pela referencia
  useEffect(() => {
    if (!enabled || chaveDosBlocos === null) return
    // Outro recorte: a lista de antes fica, esmaecida, ate a nova chegar.
    if (atual.current?.projeto === publicId) setRefreshing(true)
    else setLido(null)
    void lerTodos(() => LIST_GROUP_PAGE)
  }, [enabled, chaveDosBlocos, filtersKey, chaveDaOrdem, sprint, publicId, by])

  const flatten = useCallback((estado: Lido | null) => {
    const defs = contexto.current.definitions
    if (!estado || !defs) return null
    // Um card pode estar em dois blocos (o pai entra pelo responsavel de uma subtarefa):
    // a lista da tela, a do lote, leva cada um uma vez so.
    const vistos = new Set<string>()
    const linhas: ReportSummaryViewModel[] = []
    for (const definicao of defs) {
      for (const card of estado.blocos[definicao.key]?.reports ?? []) {
        if (vistos.has(card.PublicId)) continue
        vistos.add(card.PublicId)
        linhas.push(card)
      }
    }
    return linhas
  }, [])

  const refresh = useCallback(
    async () => flatten(await lerTodos(tamanhoGuardado)),
    [flatten, lerTodos, tamanhoGuardado],
  )

  const reload = useCallback(() => {
    setLido(null)
    void lerTodos(() => LIST_GROUP_PAGE)
  }, [lerTodos])

  /** O "Mostrar mais" de um bloco: a proxima parte, sem repetir o que ja esta la. */
  const showMore = useCallback(
    async (chave: string) => {
      const estado = atual.current
      const definicao = contexto.current.definitions?.find((d) => d.key === chave)
      const bloco = estado?.blocos[chave]
      if (!estado || !definicao || !bloco || bloco.loadingMore) return
      const minha = geracao.current
      const marcar = (mudanca: Partial<Bloco>) =>
        setLido((agora) =>
          agora?.blocos[chave]
            ? {
                ...agora,
                blocos: { ...agora.blocos, [chave]: { ...agora.blocos[chave], ...mudanca } },
              }
            : agora,
        )
      marcar({ loadingMore: true })
      const pagina = Math.floor(bloco.reports.length / LIST_GROUP_PAGE) + 1
      try {
        const resposta = await ler(definicao, pagina, LIST_GROUP_PAGE)
        if (minha !== geracao.current) return
        setLido((agora) => {
          const deAgora = agora?.blocos[chave]
          if (!agora || !deAgora) return agora
          const ja = new Set(deAgora.reports.map((card) => card.PublicId))
          return {
            ...agora,
            blocos: {
              ...agora.blocos,
              [chave]: {
                ...deAgora,
                reports: [
                  ...deAgora.reports,
                  ...resposta.reports.filter((c) => !ja.has(c.PublicId)),
                ],
                total: resposta.total,
                loadingMore: false,
                failed: false,
              },
            },
          }
        })
      } catch {
        marcar({ loadingMore: false, failed: true })
      }
    },
    [ler],
  )

  /** Le tudo de todos os blocos, para o "Selecionar todos" do lote. */
  const loadAll = useCallback(async () => {
    const defs = contexto.current.definitions ?? []
    const minha = ++geracao.current
    try {
      const blocos: Record<string, Bloco> = {}
      for (const definicao of defs) {
        const reports: ReportSummaryViewModel[] = []
        let total = 0
        for (let pagina = 1; ; pagina++) {
          const resposta = await ler(definicao, pagina, PAGINA_MAXIMA)
          reports.push(...resposta.reports)
          total = resposta.total
          if (resposta.reports.length < PAGINA_MAXIMA || reports.length >= total) break
        }
        blocos[definicao.key] = { reports, total, failed: false, loadingMore: false }
      }
      if (minha !== geracao.current) return null
      const novo = { projeto: publicId, blocos, geral: atual.current?.geral ?? null }
      setLido(novo)
      return flatten(novo)
    } catch {
      return null
    }
  }, [ler, publicId, flatten])

  /**
   * A mudanca de um card. **No mesmo bloco, troca a linha** ali mesmo; **foi para outro**
   * (mudou de coluna, de pessoa), os blocos sao relidos: so a API sabe onde ele cai na
   * ordem do bloco novo, e se ainda passa nos filtros.
   */
  const apply = useCallback(
    (card: ReportSummaryViewModel) => {
      const estado = atual.current
      if (!estado) return
      let saiu = false
      const blocos: Record<string, Bloco> = {}
      for (const [chave, bloco] of Object.entries(estado.blocos)) {
        const indice = bloco.reports.findIndex((item) => item.PublicId === card.PublicId)
        if (indice < 0) {
          blocos[chave] = bloco
          continue
        }
        if (listGroupKeyOf(card, contexto.current.by) === chave) {
          const reports = [...bloco.reports]
          reports[indice] = card
          blocos[chave] = { ...bloco, reports }
        } else {
          saiu = true
          blocos[chave] = bloco
        }
      }
      setLido({ ...estado, blocos })
      if (saiu) void lerTodos(tamanhoGuardado)
    },
    [lerTodos, tamanhoGuardado],
  )

  /** O card novo: os blocos sao relidos, e ele entra no dele. */
  const prepend = useCallback(() => {
    void lerTodos(tamanhoGuardado)
  }, [lerTodos, tamanhoGuardado])

  // ------------------------------------------------------------------ recolhidos
  const chaveDosRecolhidos = `pds.web.trabalho.lista-recolhidos.${publicId}.${by}`
  const [escolhas, setEscolhas] = useState<{ chave: string; valores: Record<string, boolean> }>(
    () => ({ chave: chaveDosRecolhidos, valores: lerRecolhidos(chaveDosRecolhidos) }),
  )
  if (escolhas.chave !== chaveDosRecolhidos) {
    setEscolhas({ chave: chaveDosRecolhidos, valores: lerRecolhidos(chaveDosRecolhidos) })
  }
  const toggle = useCallback((definicao: ListGroupDefinition) => {
    setEscolhas((antes) => {
      const recolhido = antes.valores[definicao.key] ?? definicao.collapsedByDefault
      const valores = { ...antes.valores, [definicao.key]: !recolhido }
      try {
        window.localStorage.setItem(antes.chave, JSON.stringify(valores))
      } catch {
        // Sem onde guardar, vale ate sair da tela.
      }
      return { ...antes, valores }
    })
  }, [])

  const valido = lido?.projeto === publicId ? lido : null
  const groups = useMemo<ListGroupView[] | null>(() => {
    if (!valido || !definitions) return null
    return definitions.map((definition) => {
      const bloco = valido.blocos[definition.key]
      return {
        definition,
        reports: bloco?.reports ?? [],
        total: bloco?.total ?? 0,
        failed: bloco?.failed ?? false,
        loadingMore: bloco?.loadingMore ?? false,
        collapsed: escolhas.valores[definition.key] ?? definition.collapsedByDefault,
      }
    })
  }, [valido, definitions, escolhas])

  const reports = useMemo(() => flatten(valido), [flatten, valido])
  const soma = groups?.reduce((total, grupo) => total + grupo.total, 0) ?? 0
  const total = valido?.geral ?? soma
  /**
   * Os cards com quem saiu do time. A pessoa deixa de ser do time, mas continua no card, e
   * nenhum bloco do time de agora a pega. **A tela diz quantos sao**, em vez de deixar os
   * cards sumirem calados: eles aparecem na lista sem blocos. O pai que entra por duas
   * pessoas conta duas vezes na soma, e por isso a diferenca nunca e negativa.
   */
  const outside = valido?.geral != null ? Math.max(0, valido.geral - soma) : 0

  return {
    reports,
    total,
    loading: enabled && definitions !== null && valido === null,
    failed: groups !== null && groups.length > 0 && groups.every((grupo) => grupo.failed),
    loadingMore: false,
    refreshing,
    hasMore: false,
    reload,
    refresh,
    loadMore: async () => {},
    loadAll,
    apply,
    prepend,
    groups,
    outside,
    showMore,
    retry: (chave: string) => void showMore(chave),
    toggle,
  }
}

function lerRecolhidos(chave: string): Record<string, boolean> {
  try {
    const lido = JSON.parse(window.localStorage.getItem(chave) ?? '{}')
    return lido && typeof lido === 'object' ? (lido as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}
