/**
 * O pedido para a conversa aberta procurar uma mensagem.
 *
 * **O chat do card so tem as mensagens mais recentes na tela**, e o aviso de mencao do sino
 * pode levar a um comentario antigo. Quem leva ate ele pede por aqui, e a conversa do card
 * traz as anteriores ate achar. Em `shared` porque quem pede (o sino) e quem procura (o
 * card) sao features diferentes, e nenhuma conhece a outra.
 */
export const COMMENT_SEARCH_EVENT = 'relatofacil:procurar-comentario'

/** Pede a conversa aberta que traga ate a tela o comentario, se ele for dela. */
export function requestComment(commentPublicId: string): void {
  document.dispatchEvent(new CustomEvent<string>(COMMENT_SEARCH_EVENT, { detail: commentPublicId }))
}
