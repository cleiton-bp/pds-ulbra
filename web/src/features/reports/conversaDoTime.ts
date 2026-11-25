/**
 * O pedido para trazer a conversa do time para a frente. As conversas do card ficam em
 * abas, e o "Comentar" (no alto do card e no pe, no celular) leva ao campo dela: se a aba
 * de quem relatou estiver escolhida, o campo esta escondido, e o foco nao chegaria.
 */
export const MOSTRAR_CONVERSA_DO_TIME = 'relatofacil:mostrar-conversa-do-time'

/** Pede a conversa do time. Quem a mostra troca de aba na hora, antes de quem pediu seguir. */
export function mostrarConversaDoTime(): void {
  document.dispatchEvent(new CustomEvent(MOSTRAR_CONVERSA_DO_TIME))
}
