import type { WidgetSettingsViewModel } from '@/contracts'

/**
 * A configuracao da ferramenta, do lado que roda **sem sessao**: o proprio quadro,
 * aberto no site de um cliente.
 *
 * Espelha o `ProjectWidgetSettingsService` da API, so a parte publica dela.
 */
export interface WidgetSettingsService {
  /**
   * A configuracao do projeto dono desta chave publica.
   *
   * **Devolve `null` quando a chave nao vale** — ausente, desconhecida, revogada
   * ou secreta. Nao e o mesmo que falhar: falhar significa "nao consegui saber", e
   * ai valem os padroes; `null` significa "este projeto nao existe para mim", e ai
   * nao ha ferramenta para abrir. Deixar a pessoa escrever num formulario que o
   * envio vai recusar seria pior do que nao mostrar nenhum.
   */
  loadWidgetSettings(key: string): Promise<WidgetSettingsViewModel | null>
}
