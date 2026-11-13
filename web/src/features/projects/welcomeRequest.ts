/**
 * O projeto que acabou de nascer como o primeiro da conta. A configuracao dele abre com
 * as boas-vindas, que contam o caminho ate o primeiro relato.
 *
 * Fica na memoria da pagina, e nao no armazenamento, como o balao do guia: vale so para a
 * navegacao logo depois de criar. Quem recarrega ou volta depois ja nao e a primeira vez, e
 * os primeiros passos continuam na tela.
 */
let pedidoPara: string | null = null

export function pedirBoasVindas(projectPublicId: string): void {
  pedidoPara = projectPublicId
}

export function boasVindasPedidas(projectPublicId: string): boolean {
  return pedidoPara === projectPublicId
}

export function esquecerBoasVindas(): void {
  pedidoPara = null
}
