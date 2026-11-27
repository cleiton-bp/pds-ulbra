/** Espelho de `Pds.Domain/ViewModels/ProjectStateViewModels.cs`. */

/**
 * Um estado da fila de trabalho do projeto — "Analise", "Corrigindo", o que o
 * time tiver criado.
 *
 * A lista chega **na ordem do cliente**, com os aposentados no lugar onde sempre
 * estiveram: e a mesma lista que a tela mostra e a mesma que a reordenacao
 * reescreve.
 */
export interface ProjectStateViewModel {
  PublicId: string
  Name: string
  /** A ordem na fila, contada a partir de zero. */
  Position: number
  /** Falso quando o estado foi aposentado: continua no historico, mas nao recebe relato novo. */
  IsActive: boolean
  CreatedAt: string
  /** Nenhum card passou por ela: a coluna criada para testar, por exemplo. */
  NeverUsed: boolean
  /**
   * Pode ser excluida agora: sem card nenhum, sem ser entrada de tipo nem destino da
   * reabertura, e que nunca recebeu card ou e so do time e ja foi desativada.
   */
  CanDelete: boolean
  /** Por que nao pode, quando nao pode. Nulo quando pode. */
  DeleteBlockedBy: ProjectStateDeleteBlock | null
}

/** Espelho de `ProjectStateDeleteBlockEnum`. */
export type ProjectStateDeleteBlock =
  | 'Cards'
  | 'TypeEntry'
  | 'ReopenTarget'
  | 'OnlyActiveColumn'
  | 'PublicStage'
  | 'StillActive'

/** Limite da coluna `name`: cabe num rotulo de coluna, e nao numa frase. */
export const MAX_STATE_NAME_LENGTH = 40

export interface CreateProjectStateRequest {
  Name: string
}

export interface RenameProjectStateRequest {
  Name: string
}

/** Todos os estados do projeto, do primeiro ao ultimo, uma vez cada. */
export interface ReorderProjectStatesRequest {
  Order: string[]
}
