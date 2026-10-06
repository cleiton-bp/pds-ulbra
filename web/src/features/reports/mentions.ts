/**
 * As menções do comentário interno.
 *
 * **No campo, a pessoa vê "@Ana Dona"**; o texto enviado leva `@[Ana Dona](identificador)`
 * — o nome que foi escrito e quem é. A API avisa no sino quem está no time; o painel
 * mostra a marca como "@Ana Dona" destacado. O nome muda, a pessoa não.
 */

/** Uma pessoa escolhida na lista do "@". */
export interface ChosenMention {
  name: string
  id: string
}

/** Um pedaço do comentário: texto corrido, ou uma menção. */
export type CommentPiece = { text: string } | { mention: string; id: string }

const MARCA =
  /@\[([^[\]\r\n]{1,180})\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g

/** O comentário em pedaços, para desenhar as menções destacadas. */
export function splitMentions(body: string): CommentPiece[] {
  const pedacos: CommentPiece[] = []
  let desde = 0
  for (const achado of body.matchAll(MARCA)) {
    const inicio = achado.index ?? 0
    if (inicio > desde) pedacos.push({ text: body.slice(desde, inicio) })
    pedacos.push({ mention: achado[1] ?? '', id: achado[2] ?? '' })
    desde = inicio + achado[0].length
  }
  if (desde < body.length) pedacos.push({ text: body.slice(desde) })
  return pedacos
}

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * O texto do campo com as menções escolhidas viradas em marca. Só a menção que ainda
 * está no texto vira marca — a que a pessoa apagou não avisa ninguém —, e "@Ana Dona"
 * não pega o começo de "@Ana Donato". O nome mais comprido primeiro: "@Ana Dona" não
 * pode comer o começo de "@Ana Dona Silva".
 */
export function encodeMentions(text: string, chosen: ChosenMention[]): string {
  const porNome = new Map(chosen.map((pessoa) => [pessoa.name, pessoa.id]))
  const nomes = [...porNome.keys()].sort((a, b) => b.length - a.length)
  if (nomes.length === 0) return text

  const padrao = new RegExp(`@(${nomes.map(escapar).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
  return text.replace(padrao, (_, nome: string) => `@[${nome}](${porNome.get(nome)})`)
}

/**
 * O "@" que está sendo digitado antes do cursor: onde começa e o que já foi escrito
 * depois dele. Nulo quando não há — o "@" precisa abrir a palavra (começo do texto ou
 * depois de espaço), e a busca acaba na quebra de linha ou depois de 40 letras.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const antes = text.slice(0, caret)
  const arroba = antes.lastIndexOf('@')
  if (arroba < 0) return null
  if (arroba > 0 && !/\s|[([{"']/.test(antes[arroba - 1] ?? '')) return null
  const busca = antes.slice(arroba + 1)
  if (busca.length > 40 || /[\r\n@]/.test(busca)) return null
  return { start: arroba, query: busca }
}

/** Sem acento e em minúsculas, para a lista do "@" achar "joão" digitando "joao". */
export function foldForSearch(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
