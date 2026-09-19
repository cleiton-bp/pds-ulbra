import type { CycleSettingsViewModel, SaveCycleSettingsRequest } from '@/contracts'

/**
 * As regras do ciclo de um projeto.
 *
 * **Nao ha par publico desta leitura ainda.** A pagina de acompanhamento vai
 * precisar de parte dela — se reabrir existe, se a nota e pedida —, e quando
 * precisar sera uma rota propria, com so aqueles campos: mandar as treze regras
 * para fora entregaria a quem relatou a configuracao interna do cliente.
 */
export interface ProjectCycleSettingsService {
  /**
   * As regras do projeto. **Nunca falha por nao existir**: projeto que nunca
   * salvou nada recebe os padroes, porque o ciclo dele ja se comporta deles.
   */
  getCycleSettings(publicId: string): Promise<CycleSettingsViewModel>

  /**
   * Substitui as regras inteiras.
   *
   * Substitui, e nao altera campo a campo: `ReopenStatePublicId` nulo e um valor
   * — quer dizer "a primeira coluna ativa" —, e num corpo parcial seria
   * indistinguivel de "nao mexa".
   */
  saveCycleSettings(
    publicId: string,
    settings: SaveCycleSettingsRequest,
  ): Promise<CycleSettingsViewModel>
}
