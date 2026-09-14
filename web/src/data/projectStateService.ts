import type {
  CreateProjectStateRequest,
  ProjectInitialStateViewModel,
  ProjectStateViewModel,
  RenameProjectStateRequest,
  ReorderProjectStatesRequest,
  SetInitialStateRequest,
} from '@/contracts'

/** Espelha o `ProjectStateService` da API. */
export interface ProjectStateService {
  /** A fila do projeto, na ordem, com os aposentados no lugar onde estao. */
  listProjectStates(publicId: string): Promise<ProjectStateViewModel[]>

  /** Cria um estado no fim da fila. */
  addProjectState(
    publicId: string,
    request: CreateProjectStateRequest,
  ): Promise<ProjectStateViewModel>

  /** Troca o nome. O historico nao muda: cada evento guarda o nome que valia na epoca. */
  renameProjectState(
    publicId: string,
    statePublicId: string,
    request: RenameProjectStateRequest,
  ): Promise<ProjectStateViewModel>

  /**
   * Reescreve a ordem da fila inteira de uma vez. E uma chamada so porque
   * arrastar um item mexe na posicao de todos entre a origem e o destino.
   */
  reorderProjectStates(
    publicId: string,
    request: ReorderProjectStatesRequest,
  ): Promise<ProjectStateViewModel[]>

  /** Aposenta o estado: para de receber relato novo, mas continua no historico. */
  deactivateProjectState(publicId: string, statePublicId: string): Promise<ProjectStateViewModel>

  /** Traz de volta para a fila. */
  activateProjectState(publicId: string, statePublicId: string): Promise<ProjectStateViewModel>

  /** Onde cada tipo cai ao entrar. Traz os tres sempre, escolhidos ou nao. */
  listInitialStates(publicId: string): Promise<ProjectInitialStateViewModel[]>

  /**
   * Escolhe o destino de um tipo. `StatePublicId` nulo apaga a escolha e devolve
   * o tipo ao padrao.
   */
  setInitialState(
    publicId: string,
    request: SetInitialStateRequest,
  ): Promise<ProjectInitialStateViewModel>
}
