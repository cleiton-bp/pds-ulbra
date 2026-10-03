import { type ReportStateCountViewModel, WITHOUT_STATE_FILTER } from '@/contracts'

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
