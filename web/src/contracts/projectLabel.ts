import type { CardColor } from '@/contracts/report'

/** Espelho de `Pds.Domain/ViewModels/ProjectLabelViewModels.cs`. */

/** Uma etiqueta do projeto, em ordem de nome. */
export interface ProjectLabelViewModel {
  PublicId: string
  Name: string
  Color: CardColor
  /** Em quantos cards ela esta, arquivados inclusive — apagar a tira de todos. */
  CardCount: number
  CreatedAt: string
}

/** Limite da coluna `name`: etiqueta e palavra, e nao frase. */
export const MAX_LABEL_NAME_LENGTH = 30

/**
 * Uma etiqueta nova — qualquer pessoa do time cria, ao etiquetar. O nome que ja
 * existe devolve a que existe. Sem cor, a menos usada no projeto.
 */
export interface CreateProjectLabelRequest {
  Name: string
  Color?: CardColor
}

export interface UpdateProjectLabelRequest {
  Name: string
  Color: CardColor
}
