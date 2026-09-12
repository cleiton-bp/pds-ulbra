import type { InitMessage } from '@/embed/protocol'

/**
 * De onde o quadro sabe para qual projeto enviar, e de que pagina.
 *
 * Uma funcao so, de proposito: nesta fatia ela le a barra de endereco do proprio
 * quadro, e na seguinte passa a esperar o `init` que o carregador manda por
 * `postMessage`. O formulario nao muda nos dois casos — ele nunca soube de onde
 * veio.
 */

export interface EmbedConfig {
  /** Chave publica do projeto. Sem ela o quadro nao tem o que fazer. */
  key: string
  /**
   * Caminho da pagina hospedeira, ja sem `?` e sem `#`. A API tambem corta, mas
   * cortar aqui significa que `?cpf=` nao chega a sair da maquina de quem relata.
   */
  route: string | null
  /**
   * Dominio declarado pela pagina hospedeira, conferido contra a lista de
   * enderecos autorizados do projeto. Continua sendo indicio e nao prova — quem
   * o declara e o carregador, que e codigo nosso, entao ele pega a chave colada
   * no site errado, e nao pega quem falar direto com a API.
   *
   * Nulo quando o quadro abre sem pagina hospedeira, e ai nao ha o que conferir.
   */
  origin: string | null
  /**
   * O tamanho da janela da pagina, como `1280x800`. Nulo quando o quadro abre
   * sozinho, sem carregador — ai nao ha pagina hospedeira para medir.
   */
  viewport: string | null
}

/** Fica so o caminho: o que vem depois do `?` ou do `#` nao sobe. */
export function sanitizeRoute(value: string | null): string | null {
  if (!value) return null
  const path = value.split('?')[0]?.split('#')[0]?.trim() ?? ''
  return path === '' ? null : path.slice(0, 400)
}

/**
 * Fora de um quadro embutido — abrindo `embed.html` direto — vale o que estiver
 * na barra de endereco. E como o quadro se demonstra sozinho, sem carregador.
 */
export function configFromLocation(search: string): EmbedConfig {
  const params = new URLSearchParams(search)
  return {
    key: params.get('k')?.trim() ?? '',
    route: sanitizeRoute(params.get('route')),
    origin: params.get('origin')?.trim() || null,
    // Sem pagina hospedeira nao ha janela dela para medir, e a do proprio quadro
    // seria o tamanho do formulario — um numero que nao explica defeito nenhum.
    viewport: null,
  }
}

/**
 * O tamanho da janela da pagina vira texto aqui, e so se fizer sentido.
 *
 * O valor atravessou `postMessage`, entao ele e **declarado**: uma pagina pode
 * mandar `-1`, `NaN` ou um objeto sem numero nenhum. Nao ha por que recusar o
 * relato por causa disso — descarta-se o dado e o resto segue.
 */
function formatViewport(viewport: InitMessage['viewport']): string | null {
  if (!viewport || typeof viewport !== 'object') return null

  const { width, height } = viewport

  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null

  return `${Math.round(width)}x${Math.round(height)}`
}

/**
 * Dentro de um quadro, a configuracao vem do `init` da pagina hospedeira. A rota
 * passa pelo mesmo corte de novo: a pagina ja mandou cortada, mas quem confere
 * dado que veio de fora e quem recebe.
 */
export function configFromInit(message: InitMessage): EmbedConfig {
  return {
    key: message.key.trim(),
    route: sanitizeRoute(message.route),
    origin: message.origin?.trim() || null,
    viewport: formatViewport(message.viewport),
  }
}

/**
 * O quadro espera o `init` da pagina, ou ja desenha com o que esta na barra?
 *
 * **A chave na barra vence.** Quem embute o quadro com a chave na URL ja disse
 * tudo que ele precisa saber — e o painel faz exatamente isso no relato de
 * teste, sem carregador nenhum no meio. Sem esta regra o quadro espera para
 * sempre um `init` que ninguem manda, e o que aparece e um retangulo vazio.
 *
 * Nao ha ambiguidade entre os dois caminhos: o carregador **nao** poe a chave no
 * `src`, justamente para ela nao viajar em URL.
 */
export function shouldWaitForHost(search: string, embedded: boolean): boolean {
  return embedded && configFromLocation(search).key === ''
}
