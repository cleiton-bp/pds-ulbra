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
   * **Devolve `null` quando nao ha ferramenta para abrir aqui** — e sao dois casos
   * diferentes com a mesma resposta:
   *
   * - a **chave nao vale**: ausente, desconhecida, revogada ou secreta;
   * - o **endereco nao esta autorizado** no projeto.
   *
   * Nenhum dos dois e o mesmo que falhar. Falhar significa "nao consegui saber", e
   * ai valem os padroes; `null` significa "nao e para abrir", e ai nao se desenha
   * nada. Deixar a pessoa escrever num formulario que o envio vai recusar pela
   * mesma razao seria pior do que nao mostrar nenhum.
   *
   * @param origin Endereco da pagina hospedeira, quando houver uma.
   */
  loadWidgetSettings(key: string, origin?: string | null): Promise<WidgetSettingsViewModel | null>
}
