import type {
  ProjectPriorityViewModel,
  ProjectReportTypeViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
  TeamMemberViewModel,
} from '@/contracts'
import { type ReportFilters, TEAM_CARD_FILTER } from '@/data'

/**
 * Como a lista do Trabalho se divide em blocos. **Por coluna e o padrao**: com muitos
 * relatos, a tabela corrida e a primeira a ficar ruim. "Sem blocos" devolve a tabela de
 * sempre, para quem prefere.
 *
 * **Sem bloco por sprint, de proposito.** O Backlog ja mostra a sprint em andamento, as
 * planejadas e o backlog em blocos, e a lista por sprint deixaria de fora o card sem
 * sprint que ja terminou (o recorte `backlog` da API e so o que nao terminou).
 */
export type ListGroupBy = 'state' | 'assignee' | 'priority' | 'type' | 'none'

export const LIST_GROUPINGS: readonly ListGroupBy[] = [
  'state',
  'assignee',
  'priority',
  'type',
  'none',
]

/**
 * Onde a escolha fica lembrada: neste navegador, **para a pessoa, e nao por projeto**. E
 * um jeito de ler a lista, e quem prefere blocos prefere em todos os projetos.
 */
export const LIST_GROUPING_STORAGE_KEY = 'pds.web.trabalho.lista-blocos'

/** O que distingue o bloco na tela: a coluna, a pessoa, a prioridade ou o tipo. */
export type ListGroupLook =
  | { kind: 'state'; coluna: ReportStateCountViewModel }
  | { kind: 'assignee'; pessoa: TeamMemberViewModel | null }
  | { kind: 'priority'; prioridade: ProjectPriorityViewModel | null }
  | { kind: 'type'; tipo: ProjectReportTypeViewModel | null }

/** Um bloco da lista: o que ele mostra e o que a leitura dele soma aos filtros da tela. */
export interface ListGroupDefinition {
  /** O valor do agrupamento: a coluna, a pessoa, a prioridade, o tipo, ou `none` e `team`. */
  key: string
  label: string
  look: ListGroupLook
  /** Recolhido enquanto a pessoa nao abrir: a coluna que encerra, onde fica o que terminou. */
  collapsedByDefault: boolean
  /** O recorte deste bloco, somado aos filtros da tela na leitura. */
  read: { columns?: string[]; filters?: Partial<ReportFilters> }
}

/** O que a tela ja filtrou na dimensao do agrupamento: so esses viram bloco. */
export interface ListGroupScreenFilters {
  columns: string[]
  assignees: string[]
  priorities: string[]
  types: string[]
}

export interface ListGroupSources {
  colunas: ReportStateCountViewModel[] | null
  pessoas: TeamMemberViewModel[] | null
  prioridades: ProjectPriorityViewModel[] | null
  tipos: ProjectReportTypeViewModel[] | null
}

/**
 * Os blocos de um agrupamento, na ordem da tela. Nulo enquanto a fonte deles (as colunas,
 * o time, as prioridades ou os tipos) nao chegou.
 *
 * **Nenhum card fica sem bloco.** A coluna, a prioridade e o tipo aposentados entram
 * (podem segurar card antigo), e sempre ha o bloco de quem nao tem: "Sem coluna", "Sem
 * responsável", "Sem prioridade", "Cards do time". Bloco vazio some na tela, e nao aqui.
 * A unica falta possivel e o card com quem saiu do time: ver `outside` em
 * `useGroupedReportList`.
 *
 * **Filtro na mesma dimensao recorta os blocos**: com "Responsável: Ana", so o bloco da
 * Ana. Somar o filtro ao bloco de outra pessoa nao traria nada, e mostraria blocos vazios.
 */
export function buildListGroups(
  by: ListGroupBy,
  sources: ListGroupSources,
  screen: ListGroupScreenFilters,
): ListGroupDefinition[] | null {
  const recorta = (valores: string[], chave: string) =>
    valores.length === 0 || valores.includes(chave)

  switch (by) {
    case 'none':
      return []
    case 'state': {
      if (!sources.colunas) return null
      const ativas = sources.colunas.filter((c) => c.StatePublicId !== null && c.IsActive)
      const aposentadas = sources.colunas.filter((c) => c.StatePublicId !== null && !c.IsActive)
      const semColuna = sources.colunas.filter((c) => c.StatePublicId === null)
      return [...ativas, ...aposentadas, ...semColuna]
        .map((coluna) => {
          const chave = coluna.StatePublicId ?? 'none'
          return {
            key: chave,
            label: coluna.StatePublicId === null ? 'Sem coluna' : (coluna.StateName ?? 'Coluna'),
            look: { kind: 'state', coluna } as const,
            collapsedByDefault: coluna.ClosesReport,
            read: { columns: [chave] },
          }
        })
        .filter((bloco) => recorta(screen.columns, bloco.key))
    }
    case 'assignee': {
      if (!sources.pessoas) return null
      // Quem olha primeiro, depois o time pelo nome, e quem nao tem responsavel no fim.
      const eu = sources.pessoas.find((p) => p.IsYou)
      const filtro = screen.assignees.map((valor) =>
        valor === 'me' ? (eu?.UserPublicId ?? valor) : valor,
      )
      const time = [...sources.pessoas].sort((a, b) =>
        a.IsYou !== b.IsYou ? (a.IsYou ? -1 : 1) : nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'),
      )
      return [
        ...time.map((pessoa) => ({
          key: pessoa.UserPublicId,
          label: pessoa.IsYou ? `${nomeDe(pessoa)} (você)` : nomeDe(pessoa),
          look: { kind: 'assignee', pessoa } as const,
          collapsedByDefault: false,
          read: { filters: { assignees: [pessoa.UserPublicId] } },
        })),
        {
          key: 'none',
          label: 'Sem responsável',
          look: { kind: 'assignee', pessoa: null } as const,
          collapsedByDefault: false,
          read: { filters: { assignees: ['none'] } },
        },
      ].filter((bloco) => recorta(filtro, bloco.key))
    }
    case 'priority': {
      if (!sources.prioridades) return null
      const ordem = [...sources.prioridades].sort((a, b) =>
        a.IsActive !== b.IsActive ? (a.IsActive ? -1 : 1) : a.Position - b.Position,
      )
      return [
        ...ordem.map((prioridade) => ({
          key: prioridade.PublicId,
          label: prioridade.Name,
          look: { kind: 'priority', prioridade } as const,
          collapsedByDefault: false,
          read: { filters: { priorities: [prioridade.PublicId] } },
        })),
        {
          key: 'none',
          label: 'Sem prioridade',
          look: { kind: 'priority', prioridade: null } as const,
          collapsedByDefault: false,
          read: { filters: { priorities: ['none'] } },
        },
      ].filter((bloco) => recorta(screen.priorities, bloco.key))
    }
    case 'type': {
      if (!sources.tipos) return null
      const ordem = [...sources.tipos].sort((a, b) =>
        a.IsActive !== b.IsActive ? (a.IsActive ? -1 : 1) : a.Position - b.Position,
      )
      return [
        ...ordem.map((tipo) => ({
          key: tipo.PublicId,
          label: tipo.Name,
          look: { kind: 'type', tipo } as const,
          collapsedByDefault: false,
          read: { filters: { types: [tipo.PublicId] } },
        })),
        {
          key: TEAM_CARD_FILTER,
          label: 'Cards do time',
          look: { kind: 'type', tipo: null } as const,
          collapsedByDefault: false,
          read: { filters: { types: [TEAM_CARD_FILTER] } },
        },
      ].filter((bloco) => recorta(screen.types, bloco.key))
    }
  }
}

/** O bloco em que o card mora, pelo que ele traz: para saber se uma mudanca o tirou dali. */
export function listGroupKeyOf(card: ReportSummaryViewModel, by: ListGroupBy): string {
  switch (by) {
    case 'state':
      return card.StatePublicId ?? 'none'
    case 'assignee':
      return card.Assignee?.UserPublicId ?? 'none'
    case 'priority':
      return card.Priority?.PublicId ?? 'none'
    case 'type':
      return card.Kind === 'Team' ? TEAM_CARD_FILTER : (card.Type?.PublicId ?? TEAM_CARD_FILTER)
    case 'none':
      return ''
  }
}

function nomeDe(pessoa: TeamMemberViewModel): string {
  return pessoa.Name?.trim() || pessoa.Email || 'Sem nome'
}
