import type { ProjectStatusMappingViewModel, SaveStatusMappingRequest } from '@/contracts'

/** Espelha o `ProjectStatusMappingService` da API. */
export interface ProjectStatusMappingService {
  /** O mapa que vale agora, com todo estado ativo do projeto dentro. */
  getStatusMapping(publicId: string): Promise<ProjectStatusMappingViewModel>

  /**
   * Grava o mapa inteiro, criando uma versao nova.
   *
   * Pedido igual ao que ja vale **nao** cria versao — a API confere antes de
   * gravar.
   */
  saveStatusMapping(
    publicId: string,
    request: SaveStatusMappingRequest,
  ): Promise<ProjectStatusMappingViewModel>
}
