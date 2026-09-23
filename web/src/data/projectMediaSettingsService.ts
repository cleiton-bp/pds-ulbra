import type { MediaSettingsViewModel, SaveMediaSettingsRequest } from '@/contracts'

/**
 * O que um projeto aceita receber junto do relato.
 *
 * **Nao ha par publico desta leitura ainda.** A ferramenta vai precisar saber se
 * mostra o botao de anexar e sob que limites, e quando precisar sera uma rota
 * propria — sem sessao, e com so o que o quadro precisa ver.
 */
export interface ProjectMediaSettingsService {
  /**
   * A configuracao do projeto. **Nunca falha por nao existir**: projeto que nunca
   * salvou nada recebe o padrao, porque ele ja se comporta desse jeito.
   */
  getMediaSettings(publicId: string): Promise<MediaSettingsViewModel>

  /** Substitui a configuracao inteira, com os limites de cada tipo. */
  saveMediaSettings(
    publicId: string,
    settings: SaveMediaSettingsRequest,
  ): Promise<MediaSettingsViewModel>
}
