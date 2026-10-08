import type {
  CloseSprintRequest,
  CloseSprintResultViewModel,
  SaveSprintRequest,
  SprintViewModel,
} from '@/contracts'

/**
 * As sprints do projeto: planejar, iniciar, fechar e apagar. So com a sprint ligada no
 * Ciclo; planejar e de qualquer pessoa do time.
 */
export interface SprintService {
  /** As que nao fecharam: a em andamento primeiro, depois as planejadas, com os numeros. */
  listSprints(publicId: string): Promise<SprintViewModel[]>
  /** Uma planejada nova, com o nome e as datas de fabrica quando nao vierem. */
  createSprint(publicId: string, request: SaveSprintRequest): Promise<SprintViewModel>
  /** Nome, objetivo e datas, inteiros. A fechada nao muda. */
  updateSprint(
    publicId: string,
    sprintPublicId: string,
    request: SaveSprintRequest,
  ): Promise<SprintViewModel>
  /** Inicia uma planejada, sem outra em andamento — com o que vier no pedido. */
  startSprint(
    publicId: string,
    sprintPublicId: string,
    request?: SaveSprintRequest,
  ): Promise<SprintViewModel>
  /** Fecha a em andamento, levando o que nao terminou para o destino. */
  closeSprint(
    publicId: string,
    sprintPublicId: string,
    request: CloseSprintRequest,
  ): Promise<CloseSprintResultViewModel>
  /** Apaga uma planejada; os cards dela voltam para o backlog. */
  deleteSprint(publicId: string, sprintPublicId: string): Promise<void>
}
