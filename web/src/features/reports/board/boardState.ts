import type { ProjectPriorityViewModel, TeamMemberViewModel } from '@/contracts'
import {
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
  WITHOUT_STATE_FILTER,
} from '@/contracts'

/** Uma coluna do quadro, montada da contagem que a tela ja carregou. */
export interface BoardColumn {
  /** O identificador do estado, ou `WITHOUT_STATE_FILTER` para os que ainda nao tem coluna. */
  key: string
  name: string
  /**
   * Recebe card. So a coluna ativa: "sem coluna" nao e destino (nao ha como tirar
   * um card da fila), e a aposentada nao recebe nada — a API recusaria.
   */
  accepts: boolean
  retired: boolean
  /** A coluna que encerra o relato — soltar um relato aberto nela pede desfecho e motivo. */
  closes: boolean
  /**
   * A ultima coluna ativa: e nela que vale a regra dos dias do Ciclo. Com uma coluna
   * so, nenhuma — ai a unica e a entrada da fila, e nao onde o trabalho termina.
   */
  last: boolean
  /** Todos os cards da coluna, inclusive os que a regra dos dias deixa so na lista. */
  total: number
}

/** Os cards de cada coluna, na ordem do quadro, pela chave da coluna. */
export type BoardItems = Record<string, string[]>

/**
 * As colunas do quadro, na ordem em que aparecem.
 *
 * **"Sem coluna" vem primeiro**, e so quando tem card: e o que ainda nao entrou na
 * fila, e o primeiro lugar para onde o olho vai. **A aposentada so aparece se ainda
 * segurar card**, como no filtro da lista — escondida, esse card ficaria sem
 * caminho ate ele; mostrada sempre, encheria o quadro de colunas que ninguem usa.
 */
export function boardColumns(contagens: ReportStateCountViewModel[]): BoardColumn[] {
  const ativas = contagens.filter((linha) => linha.StatePublicId !== null && linha.IsActive)
  // Como na API: com uma coluna so, a regra dos dias nao vale.
  const ultima = ativas.length > 1 ? (ativas.at(-1)?.StatePublicId ?? null) : null
  const semColuna = contagens.find((linha) => linha.StatePublicId === null)

  const colunas: BoardColumn[] =
    semColuna && semColuna.Total > 0
      ? [
          {
            key: WITHOUT_STATE_FILTER,
            name: 'Sem coluna',
            accepts: false,
            retired: false,
            closes: false,
            last: false,
            total: semColuna.Total,
          },
        ]
      : []

  for (const linha of contagens) {
    if (linha.StatePublicId === null) continue
    if (!linha.IsActive && linha.Total === 0) continue

    colunas.push({
      key: linha.StatePublicId,
      name: linha.StateName ?? '',
      accepts: linha.IsActive,
      retired: !linha.IsActive,
      closes: linha.ClosesReport,
      last: linha.StatePublicId === ultima,
      total: linha.Total,
    })
  }

  return colunas
}

/** A coluna em que o card esta, ou indefinido. */
export function columnOf(items: BoardItems, id: string): string | undefined {
  return Object.keys(items).find((chave) => items[chave]?.includes(id))
}

/**
 * Tira o card de onde estiver e o poe na coluna `to`, na posicao `index` (cortada
 * para caber). Devolve um quadro novo — o de entrada nao muda.
 */
export function moveBetween(items: BoardItems, id: string, to: string, index: number): BoardItems {
  const novo: BoardItems = {}
  for (const [chave, ids] of Object.entries(items)) novo[chave] = ids.filter((item) => item !== id)

  const destino = [...(novo[to] ?? [])]
  destino.splice(Math.max(0, Math.min(index, destino.length)), 0, id)
  novo[to] = destino

  return novo
}

/** O card logo acima deste na coluna, ou nulo quando ele esta no topo. */
export function cardAbove(ids: string[], id: string): string | null {
  const indice = ids.indexOf(id)
  return indice > 0 ? (ids[indice - 1] ?? null) : null
}

// ─── Raias ──────────────────────────────────────────────────────────────────

/** Como o quadro agrupa os cards em raias: nada, por responsavel, ou por prioridade. */
export type LaneBy = 'none' | 'assignee' | 'priority'

/** A chave da raia dos cards sem responsavel, ou sem prioridade. */
export const NO_LANE = '-'

/** Uma raia do quadro: a pessoa, ou a prioridade, e o nome que aparece. */
export interface BoardLane {
  key: string
  name: string
  /**
   * Recebe card: soltar nela troca o campo. A prioridade aposentada e a pessoa que saiu
   * do time aparecem — os cards delas estao la —, mas nao recebem: a API recusaria.
   */
  accepts: boolean
  /**
   * A pessoa do time sem card nenhum no quadro: a raia aparece compacta, no fim, para
   * receber o card que vai passar a ela.
   */
  empty?: boolean
}

/** Separa a coluna da raia na chave da celula. Nao aparece em identificador nenhum. */
const SEPARADOR = '\u001f'

/** A chave da celula — a coluna e a raia. Sem raias, a propria coluna. */
export function cellKey(coluna: string, raia: string | null): string {
  return raia === null ? coluna : `${coluna}${SEPARADOR}${raia}`
}

/** A coluna e a raia de uma celula; a raia e nula sem raias. */
export function splitCell(celula: string): { coluna: string; raia: string | null } {
  const corte = celula.indexOf(SEPARADOR)
  return corte < 0
    ? { coluna: celula, raia: null }
    : { coluna: celula.slice(0, corte), raia: celula.slice(corte + 1) }
}

/** A raia do card, pelo dado dele. */
export function laneOfCard(
  card: Pick<ReportSummaryViewModel, 'Assignee' | 'Priority'> | undefined,
  por: Exclude<LaneBy, 'none'>,
): string {
  if (!card) return NO_LANE
  return por === 'assignee'
    ? (card.Assignee?.UserPublicId ?? NO_LANE)
    : (card.Priority?.PublicId ?? NO_LANE)
}

/**
 * As raias que aparecem. **Por prioridade, todas as ativas do projeto**, da mais para a
 * menos urgente (a ordem do projeto, de tras para a frente), com card ou nao: soltar na
 * raia vazia e dar a prioridade. **Por responsavel, o time inteiro**: as pessoas com
 * card em ordem alfabetica, e depois, compactas, as sem card nenhum — e justamente a
 * pessoa livre que deve receber, e sem raia nao havia onde soltar o card para ela. A
 * aposentada e quem saiu do time aparecem se ainda tem card, sem receber. A raia "sem"
 * vem por ultimo, e sempre: e soltando nela que se tira o campo.
 *
 * A raia sai do dado dos cards, e nao de onde a mao os poe: a pessoa sem card continua
 * no fim enquanto o card esta a caminho dela, e o quadro nao pula no meio do arraste.
 */
export function boardLanes(
  cards: Pick<ReportSummaryViewModel, 'Assignee' | 'Priority'>[],
  por: Exclude<LaneBy, 'none'>,
  prioridades:
    | Pick<ProjectPriorityViewModel, 'PublicId' | 'Position' | 'Name' | 'IsActive'>[]
    | null,
  /** O time, para as raias de quem esta sem card. Nulo enquanto nao chegou. */
  pessoas: Pick<TeamMemberViewModel, 'UserPublicId' | 'Name'>[] | null = null,
): BoardLane[] {
  const vistas = new Map<string, BoardLane>()
  if (por === 'priority')
    for (const prioridade of prioridades ?? [])
      if (prioridade.IsActive)
        vistas.set(prioridade.PublicId, {
          key: prioridade.PublicId,
          name: prioridade.Name,
          accepts: true,
        })

  for (const card of cards) {
    const chave = laneOfCard(card, por)
    if (chave === NO_LANE || vistas.has(chave)) continue
    vistas.set(
      chave,
      por === 'assignee'
        ? {
            key: chave,
            name: card.Assignee?.Name ?? 'Pessoa sem nome',
            accepts: card.Assignee?.InTeam !== false,
          }
        : {
            key: chave,
            name: card.Priority?.Name ?? '',
            accepts: card.Priority?.IsActive !== false,
          },
    )
  }

  const ordem = new Map(prioridades?.map((p) => [p.PublicId, p.Position]) ?? [])
  const raias = [...vistas.values()]
  raias.sort((a, b) => {
    if (por === 'priority') {
      // A aposentada que nao vem na lista do projeto fica depois das que vem.
      const pa = ordem.get(a.key) ?? -1
      const pb = ordem.get(b.key) ?? -1
      if (pa !== pb) return pb - pa
    }
    return a.name.localeCompare(b.name, 'pt-BR')
  })
  if (por === 'assignee')
    raias.push(
      ...(pessoas ?? [])
        .filter((pessoa) => !vistas.has(pessoa.UserPublicId))
        .map((pessoa) => ({
          key: pessoa.UserPublicId,
          name: pessoa.Name || 'Pessoa sem nome',
          accepts: true,
          empty: true,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    )
  raias.push({
    key: NO_LANE,
    name: por === 'assignee' ? 'Sem responsável' : 'Sem prioridade',
    accepts: true,
  })
  return raias
}

/**
 * As celulas do quadro: os cards de cada coluna separados pela raia, cada celula na
 * ordem da coluna. Sem raias, as proprias colunas.
 */
export function boardCells(
  items: BoardItems,
  colunas: string[],
  raias: string[] | null,
  raiaDe: (id: string) => string,
): BoardItems {
  if (raias === null) return items
  const celulas: BoardItems = {}
  for (const coluna of colunas) {
    for (const raia of raias) celulas[cellKey(coluna, raia)] = []
    for (const id of items[coluna] ?? []) {
      const chave = cellKey(coluna, raiaDe(id))
      celulas[chave] = [...(celulas[chave] ?? []), id]
    }
  }
  return celulas
}

/**
 * Tira o card de onde estiver e o poe na coluna `coluna`, no lugar `indice` da celula
 * de destino — logo abaixo do card que fica acima dele na celula, na ordem da coluna
 * inteira; sem card acima, logo acima do primeiro da celula; na celula vazia, no topo
 * da coluna. `celula` sao os cards da celula de destino agora. Sem raias, a celula e
 * a coluna, e e o mesmo que `moveBetween`.
 */
export function moveToCell(
  items: BoardItems,
  id: string,
  coluna: string,
  celula: string[],
  indice: number,
): BoardItems {
  const novo: BoardItems = {}
  for (const [chave, ids] of Object.entries(items)) novo[chave] = ids.filter((item) => item !== id)

  const destino = [...(novo[coluna] ?? [])]
  const vizinhos = celula.filter((item) => item !== id && destino.includes(item))
  const i = Math.max(0, Math.min(indice, vizinhos.length))
  const acima = i > 0 ? vizinhos[i - 1] : undefined
  const abaixo = vizinhos[0]
  const lugar =
    acima !== undefined
      ? destino.indexOf(acima) + 1
      : abaixo !== undefined
        ? destino.indexOf(abaixo)
        : 0
  destino.splice(lugar, 0, id)
  novo[coluna] = destino

  return novo
}
