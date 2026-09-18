import type {
  ProjectPublicStageViewModel,
  ReorderProjectPublicStagesRequest,
  SaveProjectPublicStageRequest,
} from '@/contracts'

/** Espelha o `ProjectPublicStageService` da API. */
export interface ProjectPublicStageService {
  /**
   * A jornada do projeto, na ordem.
   *
   * **Pode vir vazia**, e isso nao e erro: e o projeto criado antes de a jornada
   * existir. `applyFactoryPublicStages` preenche com o conjunto padrao.
   */
  listPublicStages(publicId: string): Promise<ProjectPublicStageViewModel[]>

  /** Acrescenta uma etapa no fim da jornada. */
  addPublicStage(
    publicId: string,
    request: SaveProjectPublicStageRequest,
  ): Promise<ProjectPublicStageViewModel>

  /** Reescreve uma etapa inteira. O rotulo novo vale de agora em diante. */
  updatePublicStage(
    publicId: string,
    stagePublicId: string,
    request: SaveProjectPublicStageRequest,
  ): Promise<ProjectPublicStageViewModel>

  /** Tira a etapa da jornada. Recusada quando ela ficaria abaixo do minimo. */
  removePublicStage(publicId: string, stagePublicId: string): Promise<void>

  /**
   * Reescreve a ordem da jornada inteira de uma vez. E uma chamada so porque
   * arrastar um item mexe na posicao de todos entre a origem e o destino.
   */
  reorderPublicStages(
    publicId: string,
    request: ReorderProjectPublicStagesRequest,
  ): Promise<ProjectPublicStageViewModel[]>

  /** Preenche uma jornada **vazia** com o conjunto padrao. */
  applyFactoryPublicStages(publicId: string): Promise<ProjectPublicStageViewModel[]>
}
