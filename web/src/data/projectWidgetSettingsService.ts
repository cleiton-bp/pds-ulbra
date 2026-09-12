import type { WidgetSettingsViewModel } from '@/contracts'

/**
 * A configuracao da ferramenta, do lado do painel — o que exige sessao.
 *
 * E o par de `WidgetSettingsService`, que e a leitura publica feita pelo proprio
 * quadro. Os dois falam da mesma configuracao e devolvem a mesma forma; o que
 * muda e quem pode chamar.
 */
export interface ProjectWidgetSettingsService {
  /**
   * A configuracao do projeto. **Nunca falha por nao existir**: projeto que nunca
   * salvou nada recebe os padroes, porque a ferramenta dele esta no ar com eles.
   */
  getWidgetSettings(publicId: string): Promise<WidgetSettingsViewModel>

  /**
   * Substitui a configuracao inteira, com os dez campos.
   *
   * Substitui, e nao altera campo a campo: `AccentColor` nulo e um valor — quer
   * dizer "use o acento do produto" —, e num corpo parcial ele seria
   * indistinguivel de "nao mexa na cor".
   */
  saveWidgetSettings(
    publicId: string,
    settings: WidgetSettingsViewModel,
  ): Promise<WidgetSettingsViewModel>
}
