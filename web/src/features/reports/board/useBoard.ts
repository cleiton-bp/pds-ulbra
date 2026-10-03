import { useCallback, useEffect, useRef, useState } from 'react'
import { type ReportSummaryViewModel, WITHOUT_STATE_FILTER } from '@/contracts'
import { projectReportService } from '@/data'
import { isPanelError } from '@/data/errors'
import { type BoardColumn, type BoardItems, columnOf } from '@/features/reports/board/boardState'

/** Quantos cards cada coluna mostra antes do "Mostrar mais". */
export const BOARD_PAGE_SIZE = 50

/** O teto da API para uma pagina. E ate onde uma coluna aberta se recarrega de uma vez. */
const MAX_PAGE_SIZE = 100

export interface BoardColumnState {
  /** Quantos a coluna tem no quadro — na ultima, so os que a regra dos dias deixa. */
  total: number
  /**
   * A ultima leitura veio com menos do que pediu: nao ha mais o que mostrar. Sem
   * isto, um card que chegou ao topo pela mao de outra pessoa deixaria o "Mostrar
   * mais" na tela para sempre, trazendo paginas vazias.
   */
  end: boolean
  loading: boolean
  loadingMore: boolean
  failed: boolean
}

const CARREGANDO: BoardColumnState = {
  total: 0,
  end: false,
  loading: true,
  loadingMore: false,
  failed: false,
}

/**
 * Os cards do quadro, coluna por coluna, na ordem que o time arrumou.
 *
 * **Uma leitura por coluna**, cada uma com os 50 de cima e o "Mostrar mais" dela:
 * uma coluna cheia nao segura as outras, e a falha de uma nao apaga o quadro inteiro.
 * **O "Mostrar mais" pede o que vem depois do ultimo card da tela**, e nao a pagina
 * seguinte: o card que sai de cima, ou chega ao topo, muda as paginas, e a seguinte
 * pularia um card ou repetiria outro.
 *
 * **A ordem mora em `items`**, separada dos dados de cada card (`cards`): arrastar
 * mexe so na ordem, e a resposta da API troca so os dados. O `items` tambem vive
 * numa referencia, para quem solta ler a ordem de agora — e nao a da ultima
 * renderizacao.
 *
 * Como a lista, tem contador de geracao: trocar de projeto dispara leituras novas sem
 * cancelar as antigas, e sem ele a resposta do projeto anterior pintaria card no
 * quadro do novo.
 */
export function useBoard(projectPublicId: string, columns: BoardColumn[] | null, enabled: boolean) {
  const [items, setItemsState] = useState<BoardItems>({})
  const itemsRef = useRef<BoardItems>({})
  const [cards, setCards] = useState<Record<string, ReportSummaryViewModel>>({})
  const [state, setState] = useState<Record<string, BoardColumnState>>({})
  const generation = useRef(0)

  const setItems = useCallback((proximo: BoardItems | ((atual: BoardItems) => BoardItems)) => {
    const valor = typeof proximo === 'function' ? proximo(itemsRef.current) : proximo
    itemsRef.current = valor
    setItemsState(valor)
  }, [])

  const guardar = useCallback((lista: ReportSummaryViewModel[]) => {
    setCards((atual) => {
      const novo = { ...atual }
      for (const card of lista) novo[card.PublicId] = card
      return novo
    })
  }, [])

  const buscar = useCallback(
    (chave: string, pageSize: number, after?: string) =>
      projectReportService.listReports(projectPublicId, 1, chave, false, {
        order: 'board',
        pageSize,
        ...(after ? { after } : {}),
      }),
    [projectPublicId],
  )

  const loadColumn = useCallback(
    async (chave: string, pageSize = BOARD_PAGE_SIZE) => {
      const minha = generation.current
      // A coluna que ja mostra cards continua mostrando enquanto e relida: o esqueleto
      // no lugar dela piscava a cada dialogo fechado, e a pagina encolhia e pulava.
      const temCards = (itemsRef.current[chave]?.length ?? 0) > 0
      setState((atual) => ({
        ...atual,
        [chave]: { ...(atual[chave] ?? CARREGANDO), loading: !temCards, failed: false },
      }))

      try {
        const pagina = await buscar(chave, pageSize)
        if (minha !== generation.current) return

        guardar(pagina.reports)
        setItems((atual) => ({ ...atual, [chave]: pagina.reports.map((card) => card.PublicId) }))
        setState((atual) => ({
          ...atual,
          [chave]: {
            total: pagina.total,
            end: pagina.reports.length < pageSize,
            loading: false,
            loadingMore: false,
            failed: false,
          },
        }))
      } catch {
        if (minha !== generation.current) return
        setState((atual) => ({
          ...atual,
          [chave]: { ...(atual[chave] ?? CARREGANDO), loading: false, failed: true },
        }))
      }
    },
    [buscar, guardar, setItems],
  )

  /**
   * Recarrega a coluna com tudo o que ja estava aberto nela (ate o teto da pagina).
   * E o que acerta os numeros da frente do card depois de alguem comentar ou anexar
   * pelo dialogo — eles nao voltam nas respostas de la.
   */
  const reloadColumn = useCallback(
    (chave: string) => {
      const abertos = itemsRef.current[chave]?.length ?? 0
      return loadColumn(chave, Math.min(MAX_PAGE_SIZE, Math.max(BOARD_PAGE_SIZE, abertos)))
    },
    [loadColumn],
  )

  // As colunas entram na dependencia pela lista de chaves, e nao pelo objeto: a
  // contagem e relida a cada movimento, e reler o quadro inteiro por isso jogaria
  // fora o "Mostrar mais" de quem estava olhando.
  const chaves = columns?.map((coluna) => coluna.key).join('|') ?? ''
  /** O que o quadro tem aberto: de qual projeto, e quais colunas. */
  const aberto = useRef<{ projeto: string; chaves: Set<string> } | null>(null)

  useEffect(() => {
    // Fora da vista do quadro nada e lido — e, ao voltar, tudo e lido de novo.
    if (!enabled) {
      aberto.current = null
      return
    }
    if (chaves === '') return
    const lista = chaves.split('|')

    if (aberto.current?.projeto !== projectPublicId) {
      generation.current += 1
      aberto.current = { projeto: projectPublicId, chaves: new Set(lista) }
      setItems({})
      setCards({})
      setState({})
      for (const chave of lista) void loadColumn(chave)
      return
    }

    // O conjunto de colunas mudou no mesmo projeto — "Sem coluna" esvaziou, uma
    // aposentada ganhou card —: so a coluna nova e lida, e a que saiu sai. Reler o
    // quadro inteiro jogaria fora o "Mostrar mais" e o foco de quem estava nele.
    const antes = aberto.current.chaves
    aberto.current = { projeto: projectPublicId, chaves: new Set(lista) }
    const sairam = [...antes].filter((chave) => !lista.includes(chave))
    if (sairam.length > 0) {
      const semAsQueSairam = <T>(todos: Record<string, T>) =>
        Object.fromEntries(Object.entries(todos).filter(([chave]) => !sairam.includes(chave)))
      setItems(semAsQueSairam)
      setState(semAsQueSairam)
    }
    for (const chave of lista) if (!antes.has(chave)) void loadColumn(chave)
  }, [enabled, chaves, projectPublicId, loadColumn, setItems])

  const loadMore = useCallback(
    async (chave: string) => {
      const atual = state[chave]
      const ultimo = itemsRef.current[chave]?.at(-1)
      if (!atual || atual.loadingMore || !ultimo) return

      const minha = generation.current
      setState((todos) => ({ ...todos, [chave]: { ...atual, loadingMore: true } }))

      try {
        const pagina = await buscar(chave, BOARD_PAGE_SIZE, ultimo)
        if (minha !== generation.current) return

        guardar(pagina.reports)
        // Sem repetir: o card que acabou de ser solto la embaixo pode ja estar na tela.
        setItems((todos) => {
          const ja = new Set(todos[chave] ?? [])
          return {
            ...todos,
            [chave]: [
              ...(todos[chave] ?? []),
              ...pagina.reports.map((card) => card.PublicId).filter((id) => !ja.has(id)),
            ],
          }
        })
        setState((todos) => ({
          ...todos,
          [chave]: {
            ...atual,
            total: pagina.total,
            end: pagina.reports.length < BOARD_PAGE_SIZE,
            loadingMore: false,
          },
        }))
      } catch (falha) {
        if (minha !== generation.current) return
        setState((todos) => ({ ...todos, [chave]: { ...atual, loadingMore: false } }))
        // O ultimo card da tela ja saiu da coluna — outra pessoa o moveu ou arquivou:
        // a coluna e lida de novo, com tudo o que estava aberto nela.
        if (isPanelError(falha) && (falha.status === 409 || falha.status === 404)) {
          await reloadColumn(chave)
          return
        }
        throw falha
      }
    },
    [buscar, guardar, setItems, state, reloadColumn],
  )

  /**
   * Um card a mais, ou a menos, numa coluna. O total da coluna e o que o cabecalho
   * mostra, e ele acompanha o que entra e sai sem buscar a coluna de novo.
   */
  const adjustTotal = useCallback((chave: string, delta: number) => {
    setState((atual) => {
      const coluna = atual[chave]
      return coluna
        ? { ...atual, [chave]: { ...coluna, total: Math.max(0, coluna.total + delta) } }
        : atual
    })
  }, [])

  /**
   * O card como a API o devolveu, de onde quer que tenha vindo a mudanca.
   *
   * **Trocou de coluna sem ser arrastado** — pelo seletor do dialogo — e o card vai
   * para o topo da coluna nova, que e onde a API o pos. **Arquivado** sai do quadro.
   * O resto so troca os dados.
   */
  const apply = useCallback(
    (card: ReportSummaryViewModel) => {
      const id = card.PublicId
      const onde = columnOf(itemsRef.current, id)
      if (onde === undefined) return

      if (card.ArchivedAt !== null) {
        setItems((atual) => ({
          ...atual,
          [onde]: (atual[onde] ?? []).filter((item) => item !== id),
        }))
        adjustTotal(onde, -1)
        return
      }

      setCards((atual) => ({ ...atual, [id]: { ...atual[id], ...card } }))

      const destino = card.StatePublicId ?? WITHOUT_STATE_FILTER
      if (destino !== onde) {
        setItems((atual) => {
          const novo = { ...atual, [onde]: (atual[onde] ?? []).filter((item) => item !== id) }
          if (destino in novo) novo[destino] = [id, ...(novo[destino] ?? [])]
          return novo
        })
        adjustTotal(onde, -1)
        adjustTotal(destino, 1)
      }
    },
    [adjustTotal, setItems],
  )

  /**
   * Troca so os dados do card, sem mexer na ordem: e a resposta de quem soltou, e o
   * lugar ja esta certo na tela.
   */
  const update = useCallback((card: ReportSummaryViewModel) => {
    setCards((atual) => ({ ...atual, [card.PublicId]: { ...atual[card.PublicId], ...card } }))
  }, [])

  /** O card que acabou de nascer: no topo da coluna dele, como a API o pos. */
  const insert = useCallback(
    (card: ReportSummaryViewModel) => {
      const chave = card.StatePublicId ?? WITHOUT_STATE_FILTER
      guardar([card])
      setItems((atual) =>
        chave in atual ? { ...atual, [chave]: [card.PublicId, ...(atual[chave] ?? [])] } : atual,
      )
      adjustTotal(chave, 1)
    },
    [adjustTotal, guardar, setItems],
  )

  return {
    items,
    itemsRef,
    setItems,
    cards,
    state,
    loadColumn,
    loadMore,
    reloadColumn,
    adjustTotal,
    apply,
    update,
    insert,
  }
}

export type Board = ReturnType<typeof useBoard>
