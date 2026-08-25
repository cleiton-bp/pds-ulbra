/**
 * Erro unico da camada de dados: mock e API levantam este mesmo tipo, com o mesmo
 * `status`, e por isso a tela nao precisa de dois caminhos de erro.
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
 * Mensagem e status bastam enquanto a decisao da tela couber num numero (401
 * desloga, 404 nao encontrado, 409 nome repetido, 0 rede caida). O sinal de que
 * a hora de um codigo proprio chegou e o primeiro `if` que le a **mensagem** para
 * decidir — comparar texto quebra quando alguem corrige uma virgula no C#.
 */
export function describeError(error: unknown): string {
  if (isPanelError(error)) return error.message
  return 'Nao foi possivel completar a operacao. Tente de novo.'
}
