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
  /** Dominio declarado pela pagina hospedeira. Indicio, nunca prova. */
  origin: string | null
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
  }
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
  }
}
