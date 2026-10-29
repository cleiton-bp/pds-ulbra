/**
 * O texto das explicacoes do tour (ver `ModelingGuide` e `UseCasesGuide`), tirado do
 * arquivo aberto. Frase curta, em portugues de conversa, e com os nomes de verdade:
 * a explicacao fala desta modelagem, e nao de uma qualquer.
 */

/**
 * O assunto do arquivo em uma frase: a primeira da descricao, sem o aparte entre
 * travessoes e ate os dois-pontos ou o ponto e virgula; o resto e detalhe. Sem
 * descricao, vazio.
 */
export function gist(description: string): string {
  const sentence = (description.trim().split(/(?<=[.!?])\s/)[0] ?? '')
    .replace(/\s+[—–]\s[^—–]+?\s[—–](,?)/g, '$1')
  const head = (sentence.split(/[:;]/)[0] ?? '').trim().replace(/[\s,—–-]+$/, '')
  if (!head) return ''
  return /[.!?]$/.test(head) ? head : `${head}.`
}

/** "1 tabela" / "3 tabelas". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "a, b e c", e, passando de `max`, "a, b e mais 4". */
export function names(list: readonly string[], max = 3): string {
  if (list.length <= max) {
    return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`
  }
  return `${list.slice(0, max).join(', ')} e mais ${list.length - max}`
}
