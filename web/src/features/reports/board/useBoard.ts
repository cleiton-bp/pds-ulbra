import { useCallback, useEffect, useRef, useState } from 'react'
import { type ReportSummaryViewModel, WITHOUT_STATE_FILTER } from '@/contracts'
import type { ReportFilters } from '@/data'
import { projectReportService } from '@/data'
import { isPanelError } from '@/data/errors'
import { type BoardColumn, type BoardItems, columnOf } from '@/features/reports/board/boardState'

/** Quantos cards cada coluna mostra antes do "Mostrar mais". */
export const BOARD_PAGE_SIZE = 50

/** O teto da API para uma pagina. A coluna aberta alem dele e relida em mais de um pedido. */
const MAX_PAGE_SIZE = 100

/** Avisos que chegam juntos — um movimento e o comentario logo depois — viram uma releitura so. */
export const REMOTE_BATCH_MS = 250

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
export function useBoard(
  projectPublicId: string,
  columns: BoardColumn[] | null,
  enabled: boolean,
  /**
   * Os cards que outra pessoa mudou, quando as colunas deles acabaram de ser relidas —
   * e nao quando o aviso chegou: a releitura pode esperar um arraste, e o destaque
   * acenderia num lugar em que o card ainda nao esta.
   */
  aoReler?: (mudados: { id: string; numero?: number }[]) => void,
  /**
   * Os filtros da tela de Trabalho, e a chave deles. Cada coluna e lida com eles, e
   * a chave nova rele todas as colunas abertas.
   */
  filters?: ReportFilters,
  filtersKey = '',
  /**
   * Com a sprint ligada, o recorte do quadro: `active`, a sprint em andamento. Entra
   * na chave junto dos filtros — ligar ou desligar rele as colunas.
   */
  sprint?: string,
) {
  const filtros = useRef(filters)
  filtros.current = filters
  const recorte = useRef(sprint)
  recorte.current = sprint
  const aoRelerAgora = useRef(aoReler)
  aoRelerAgora.current = aoReler
  const [items, setItemsState] = useState<BoardItems>({})
  const itemsRef = useRef<BoardItems>({})
  const [cards, setCards] = useState<Record<string, ReportSummaryViewModel>>({})
  // Os cards lidos ate agora, para quem pergunta antes da proxima renderizacao.
  const cardsRef = useRef<Record<string, ReportSummaryViewModel>>({})
  const [state, setState] = useState<Record<string, BoardColumnState>>({})
  const generation = useRef(0)

  /**
   * Quantas vezes a ordem de cada coluna mudou nesta tela — um arraste, um card criado,
   * um "Mostrar mais". A leitura da coluna que estava no ar quando ela mudou pode ter
   * sido feita antes, e nao passa por cima: a coluna e lida de novo.
   */
  const mexidas = useRef<Record<string, number>>({})
  /** A ultima leitura pedida de cada coluna. So ela vale quando chega. */
  const ultimaLeitura = useRef<Record<string, number>>({})

  const escrever = useCallback((valor: BoardItems) => {
    itemsRef.current = valor
    setItemsState(valor)
  }, [])

  const setItems = useCallback(
    (proximo: BoardItems | ((atual: BoardItems) => BoardItems)) => {
      const antes = itemsRef.current
      const valor = typeof proximo === 'function' ? proximo(antes) : proximo
      for (const chave of new Set([...Object.keys(antes), ...Object.keys(valor)]))
        if (antes[chave] !== valor[chave])
          mexidas.current[chave] = (mexidas.current[chave] ?? 0) + 1
      escrever(valor)
    },
    [escrever],
  )

  // ─── O que chega pelo tempo real (as filas; quem as usa vem mais abaixo) ──
  /** As colunas a reler por causa de avisos, esperando a vez. */
  const pendentes = useRef(new Set<string>())
  /** Os cards dos avisos, para acender quando a releitura chegar. */
  const mudadosPorOutros = useRef(new Set<string>())
  /** Quantos motivos ha para esperar: um arraste, um movimento gravando, o desfecho aberto. */
  const segurando = useRef(0)
  const juntando = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Agenda a releitura do que esta em `pendentes` — definido mais abaixo. */
  const agendarReleitura = useRef<() => void>(() => {})

  const guardar = useCallback((lista: ReportSummaryViewModel[]) => {
    for (const card of lista) cardsRef.current[card.PublicId] = card
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
        ...(filtersKey && filtros.current ? { filters: filtros.current } : {}),
        ...(recorte.current ? { sprint: recorte.current } : {}),
      }),
    [projectPublicId, filtersKey],
  )

  const loadColumn = useCallback(
    async (chave: string, quantos = BOARD_PAGE_SIZE) => {
      const minha = generation.current
      const esta = (ultimaLeitura.current[chave] ?? 0) + 1
      ultimaLeitura.current[chave] = esta
      const mexidaAntes = mexidas.current[chave] ?? 0
      const valendo = () => minha === generation.current && esta === ultimaLeitura.current[chave]
      /** Le de novo pelo caminho que espera a mao terminar, sem esqueleto nem erro na tela. */
      const deNovo = () => {
        setState((atual) => ({
          ...atual,
          [chave]: { ...(atual[chave] ?? CARREGANDO), loading: false },
        }))
        pendentes.current.add(chave)
        agendarReleitura.current()
      }
      // A coluna ja lida continua na tela enquanto e relida — com cards ou vazia: o
      // esqueleto no lugar dela piscava a cada dialogo fechado, e a coluna mudava de altura.
      const jaLida = itemsRef.current[chave] !== undefined
      setState((atual) => ({
        ...atual,
        [chave]: { ...(atual[chave] ?? CARREGANDO), loading: !jaLida, failed: false },
      }))

      // Ate o teto da API por pedido; o que passa dele vem depois do ultimo lido.
      const lidos: ReportSummaryViewModel[] = []
      let total = 0
      let fim = false
      try {
        while (!fim && lidos.length < quantos) {
          const pedir = Math.min(MAX_PAGE_SIZE, quantos - lidos.length)
          const pagina = await buscar(chave, pedir, lidos.at(-1)?.PublicId)
          if (!valendo()) return
          lidos.push(...pagina.reports)
          total = pagina.total
          fim = pagina.reports.length < pedir
        }
      } catch (falha) {
        if (!valendo()) return
        // O card de referencia saiu da coluna entre um pedido e outro: comeca de novo.
        if (
          lidos.length > 0 &&
          isPanelError(falha) &&
          (falha.status === 409 || falha.status === 404)
        ) {
          deNovo()
          return
        }
        setState((atual) => ({
          ...atual,
          [chave]: { ...(atual[chave] ?? CARREGANDO), loading: false, failed: true },
        }))
        return
      }

      // A ordem mudou aqui enquanto a leitura estava no ar: ela pode ter sido feita antes.
      if ((mexidas.current[chave] ?? 0) !== mexidaAntes) {
        deNovo()
        return
      }

      guardar(lidos)
      escrever({
        ...itemsRef.current,
        [chave]: [...new Set(lidos.map((card) => card.PublicId))],
      })
      setState((atual) => ({
        ...atual,
        [chave]: { total, end: fim, loading: false, loadingMore: false, failed: false },
      }))
    },
    [buscar, guardar, escrever],
  )

  /**
   * Recarrega a coluna com tudo o que ja estava aberto nela. E o que acerta os numeros
   * da frente do card depois de alguem comentar ou anexar pelo dialogo — eles nao voltam
   * nas respostas de la.
   */
  const reloadColumn = useCallback(
    (chave: string) => {
      const abertos = itemsRef.current[chave]?.length ?? 0
      return loadColumn(chave, Math.max(BOARD_PAGE_SIZE, abertos))
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
      cardsRef.current = {}
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

  // O filtro mudou: cada coluna aberta e lida de novo do comeco, com os cards de agora
  // na tela ate a leitura nova chegar. A geracao nova descarta o "Mostrar mais" que
  // estava no ar com o filtro de antes.
  const filtroLido = useRef(filtersKey)
  useEffect(() => {
    if (filtroLido.current === filtersKey) return
    filtroLido.current = filtersKey
    if (!enabled || aberto.current === null) return
    generation.current += 1
    for (const chave of aberto.current.chaves) void loadColumn(chave)
  }, [filtersKey, enabled, loadColumn])

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

  // ─── O que chega pelo tempo real ──────────────────────────────────────────
  const reler = useCallback(() => {
    juntando.current = null
    if (segurando.current > 0) return
    const lista = [...pendentes.current].filter((chave) => aberto.current?.chaves.has(chave))
    const mudados = [...mudadosPorOutros.current]
    pendentes.current.clear()
    mudadosPorOutros.current.clear()
    if (aberto.current === null) return
    void Promise.all(lista.map((chave) => reloadColumn(chave))).then(() => {
      if (mudados.length > 0)
        aoRelerAgora.current?.(mudados.map((id) => ({ id, numero: cardsRef.current[id]?.Number })))
    })
  }, [reloadColumn])

  const agendar = useCallback(() => {
    if (juntando.current === null) juntando.current = setTimeout(reler, REMOTE_BATCH_MS)
  }, [reler])
  agendarReleitura.current = agendar

  useEffect(
    () => () => {
      if (juntando.current !== null) clearTimeout(juntando.current)
    },
    [],
  )

  /**
   * Outra pessoa mudou um card: rele a coluna em que ele esta **nesta tela** e a coluna
   * em que ele esta **agora** (a do aviso) — uma so, quando sao a mesma; nenhuma de
   * destino, quando ele foi para o arquivo. Coluna que esta tela nao tem (nova, ou fora
   * do quadro) nao e lida aqui: a contagem relida traz a coluna nova, e ela entra pelo
   * caminho de sempre.
   */
  const remoteChange = useCallback(
    (cardId: string, destino: string | null) => {
      const daqui = columnOf(itemsRef.current, cardId)
      if (daqui) pendentes.current.add(daqui)
      if (destino) pendentes.current.add(destino)
      mudadosPorOutros.current.add(cardId)
      agendar()
    },
    [agendar],
  )

  /** Rele todas as colunas: a configuracao mudou, ou a conexao voltou e pode ter perdido avisos. */
  const reloadAll = useCallback(() => {
    for (const chave of aberto.current?.chaves ?? []) pendentes.current.add(chave)
    agendar()
  }, [agendar])

  /**
   * Segura as releituras ate a mao terminar. Reler a coluna no meio de um arraste
   * tiraria o card debaixo do ponteiro; reler enquanto o proprio movimento grava traria
   * a ordem de antes dele, e o card pularia para tras e para a frente. Devolve quem
   * solta — uma vez so; o que chegou no meio e relido ao soltar o ultimo.
   */
  const hold = useCallback(() => {
    segurando.current += 1
    let solto = false
    return () => {
      if (solto) return
      solto = true
      segurando.current -= 1
      if (segurando.current === 0 && pendentes.current.size > 0) agendar()
    }
  }, [agendar])

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
    remoteChange,
    reloadAll,
    hold,
  }
}

export type Board = ReturnType<typeof useBoard>
