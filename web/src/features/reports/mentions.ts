/**
 * As mencoes do comentario interno.
 *
 * **No campo, a pessoa ve "@Ana Dona"**; o texto enviado leva `@[Ana Dona](identificador)`
 * — o nome que foi escrito e quem e. A API avisa no sino quem esta no time; o painel
 * mostra a marca como "@Ana Dona" destacado. O nome muda, a pessoa nao.
 */

/** Uma pessoa escolhida na lista do "@". */
export interface ChosenMention {
  name: string
  id: string
}

/** Um pedaco do comentario: texto corrido, ou uma mencao. */
export type CommentPiece = { text: string } | { mention: string; id: string }

const MARCA =
  /@\[([^[\]\r\n]{1,180})\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g

/** O comentario em pedacos, para desenhar as mencoes destacadas. */
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
 * O texto do campo com as mencoes escolhidas viradas em marca. So a mencao que ainda
 * esta no texto vira marca — a que a pessoa apagou nao avisa ninguem —, e "@Ana Dona"
 * nao pega o comeco de "@Ana Donato". O nome mais comprido primeiro: "@Ana Dona" nao
 * pode comer o comeco de "@Ana Dona Silva".
 */
export function encodeMentions(text: string, chosen: ChosenMention[]): string {
  const porNome = new Map(chosen.map((pessoa) => [pessoa.name, pessoa.id]))
  const nomes = [...porNome.keys()].sort((a, b) => b.length - a.length)
  if (nomes.length === 0) return text

  const padrao = new RegExp(`@(${nomes.map(escapar).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
  return text.replace(padrao, (_, nome: string) => `@[${nome}](${porNome.get(nome)})`)
}

/**
 * O caminho de volta de `encodeMentions`, para corrigir um comentario: o texto como a
 * pessoa o escreveu ("@Ana Dona") e quem cada mencao e. Reenviado, cada "@Nome" que
 * continuar no texto volta a ser a marca de quem era.
 */
export function decodeMentions(body: string): { text: string; chosen: ChosenMention[] } {
  const chosen: ChosenMention[] = []
  const text = splitMentions(body)
    .map((pedaco) => {
      if ('text' in pedaco) return pedaco.text
      if (!chosen.some((pessoa) => pessoa.id === pedaco.id))
        chosen.push({ name: pedaco.mention, id: pedaco.id })
      return `@${pedaco.mention}`
    })
    .join('')
  return { text, chosen }
}

/**
 * O "@" que esta sendo digitado antes do cursor: onde comeca e o que ja foi escrito
 * depois dele. Nulo quando nao ha — o "@" precisa abrir a palavra (comeco do texto ou
 * depois de espaco), e a busca acaba na quebra de linha ou depois de 40 letras.
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

/** Sem acento e em minusculas, para a lista do "@" achar o nome com acento digitando sem ele. */
export function foldForSearch(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
