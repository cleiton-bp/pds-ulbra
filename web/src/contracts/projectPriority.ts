import type { CardColor } from '@/contracts/report'

/** Espelho de `Pds.Domain/ViewModels/ProjectPriorityViewModels.cs`. */

/**
 * Uma prioridade do projeto — "Baixa", "Média", "Alta", "Urgente", ou o que o time
 * tiver criado. Chega da menos para a mais urgente, com as aposentadas no lugar
 * delas: e a mesma lista que a reordenacao reescreve.
 */
export interface ProjectPriorityViewModel {
  PublicId: string
  Name: string
  Color: CardColor
  /** A ordem, da menos para a mais urgente, contada a partir de zero. */
  Position: number
  /** Falso quando foi aposentada: continua nos cards que a tem, e nao e mais oferecida. */
  IsActive: boolean
  CreatedAt: string
}

/** Limite da coluna `name`, o mesmo do estado. */
export const MAX_PRIORITY_NAME_LENGTH = 40

export interface CreateProjectPriorityRequest {
  Name: string
  Color: CardColor
}

export interface UpdateProjectPriorityRequest {
  Name: string
  Color: CardColor
}

/** Todas as prioridades do projeto, da menos para a mais urgente, uma vez cada. */
export interface ReorderProjectPrioritiesRequest {
  Order: string[]
}
