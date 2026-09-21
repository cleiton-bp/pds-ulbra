import type { IdentitySettingsViewModel, SaveIdentitySettingsRequest } from '@/contracts'

/**
 * Como quem relata e identificado num projeto.
 *
 * **Nao ha par publico desta leitura ainda.** A ferramenta vai precisar saber o
 * modo para se comportar — se pede codigo, se aceita identidade assinada, ou se
 * nao pergunta nada —, e quando precisar sera uma rota propria com so aquele
 * campo.
 */
export interface ProjectIdentitySettingsService {
  /**
   * O modo do projeto. **Nunca falha por nao existir**: projeto que nunca salvou
   * nada recebe o padrao, porque ele ja se comporta desse jeito.
   */
  getIdentitySettings(publicId: string): Promise<IdentitySettingsViewModel>

  /** Substitui a configuracao inteira. */
  saveIdentitySettings(
    publicId: string,
    settings: SaveIdentitySettingsRequest,
  ): Promise<IdentitySettingsViewModel>
}
