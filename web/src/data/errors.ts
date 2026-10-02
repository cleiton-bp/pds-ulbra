/**
 * Erro unico da camada de dados. A tela decide pelo `status`, e nunca pelo texto
 * da mensagem.
 */
export class PanelError extends Error {
  /** Codigo HTTP. 0 quando a falha foi de rede, antes da resposta. */
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PanelError'
    this.status = status
  }
}

export function isPanelError(error: unknown): error is PanelError {
  return error instanceof PanelError
}

/**
 * A falha que se repetiria igual: a API respondeu, e respondeu que nao — um 4xx,
 * menos o 408 (demorou demais) e o 429 (muitas tentativas), que passam sozinhos.
 *
 * Rede caida (status 0) e erro do servidor (5xx) **nao** sao definitivos: tentar de
 * novo daqui a pouco pode dar certo. Nem o erro que nao veio da camada de dados, que
 * nao diz o que foi.
 */
export function isDefinitiveError(error: unknown): boolean {
  if (!isPanelError(error)) return false

  const { status } = error
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

/**
 * Mensagem e status bastam enquanto a decisao da tela couber num numero (401
 * desloga, 404 nao encontrado, 409 nome repetido, 0 rede caida). O sinal de que
 * a hora de um codigo proprio chegou e o primeiro `if` que le a **mensagem** para
 * decidir — comparar texto quebra quando alguem corrige uma virgula no C#.
 */
export function describeError(error: unknown): string {
  if (isPanelError(error)) return error.message
  return 'Nao foi possivel completar a operacao. Tente de novo.'
}
