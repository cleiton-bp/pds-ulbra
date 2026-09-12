import type { EmbedConfig } from '@/embed/config'

/**
 * O que vai junto com o relato sem ninguem digitar.
 *
 * **Tres dados, e nenhum deles identifica a pessoa.** Navegador, idioma e tamanho
 * da janela existem para o time conseguir reproduzir o problema — "so quebra no
 * Safari" e "so quebra em tela estreita" sao as duas respostas que mais faltam
 * num relato, e ambas custariam uma pergunta de volta que ninguem responde.
 *
 * O que **nao** entra e o mais importante daqui: nada de endereco de rede, nada
 * do que estava na tela, nada de identificador persistente. O que a pessoa quis
 * contar ela escreveu; o resto que o navegador sabe nao e nosso para pegar.
 *
 * Chave em ingles e `snake_case` porque ela vira linha no banco e aparece em
 * consulta; a palavra que o painel mostra e outra, e mora la.
 */
export function buildReportContext(config: EmbedConfig): Record<string, string> | null {
  const context: Record<string, string> = {}

  if (config.viewport) context.viewport = config.viewport

  const agent = navigator.userAgent?.trim()
  if (agent) context.user_agent = agent

  const language = navigator.language?.trim()
  if (language) context.language = language

  // Nulo e nao objeto vazio: a API grava par a par, e mandar `{}` faria a linha
  // existir com zero pares para quem for ler depois.
  return Object.keys(context).length > 0 ? context : null
}
