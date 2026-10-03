/**
 * O Markdown da descricao do card do time, lido para uma arvore — e so.
 *
 * **Nao existe HTML em lugar nenhum deste caminho.** O texto vira nos e os nos
 * viram elementos React (`Markdown.tsx`), que escapam tudo o que e texto. Um
 * `<script>` escrito na descricao aparece como `<script>` escrito na descricao.
 * Biblioteca de Markdown costuma gerar HTML e depois limpar; aqui nao ha o que
 * limpar, porque nunca houve HTML.
 *
 * **Link so com `http`, `https` ou `mailto`.** `javascript:` e companhia viram o
 * texto que eram. E sem imagem: `![x](...)` fica como texto — imagem de fora
 * carregada no painel avisaria um servidor qualquer de que alguem abriu o card.
 *
 * **O subconjunto e o do dia a dia de um card**: paragrafo, quebra de linha,
 * titulo (`#`, `##`, `###`), lista com `-` ou `*`, lista numerada, citacao (`>`),
 * bloco de codigo (` ``` ` sozinho na linha), e no meio do texto negrito (`**`),
 * italico (`*` ou `_`), codigo (`` ` ``, ou mais crases quando o codigo tem crase),
 * link (`[texto](https://...)`) e endereco solto (`https://...`). A barra cria
 * essas marcas; quem digita tambem pode.
 */

export type MarkdownInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: MarkdownInline[] }
  | { kind: 'em'; children: MarkdownInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: MarkdownInline[] }
  | { kind: 'break' }

export type MarkdownBlock =
  | { kind: 'paragraph'; children: MarkdownInline[] }
  | { kind: 'heading'; level: 1 | 2 | 3; children: MarkdownInline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: MarkdownInline[][] }
  | { kind: 'quote'; children: MarkdownInline[] }
  | { kind: 'code'; text: string }

/**
 * A cerca so abre sozinha na linha — com a linguagem ao lado, se quiser. Assim
 * ```npm ci``` no meio de um paragrafo e codigo no texto, e nao um bloco que engole
 * o resto do card. Fecha so a cerca sem nada.
 */
const FENCE_OPEN = /^\s*```[^`]*$/
const FENCE_CLOSE = /^\s*```\s*$/
const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/

/** Os esquemas que viram link. O resto fica como texto. */
const SAFE_LINK = /^(https?:\/\/|mailto:)/i

/** Se a linha comeca um bloco proprio — e por isso termina o paragrafo de antes. */
function startsBlock(line: string): boolean {
  return (
    FENCE_OPEN.test(line) ||
    HEADING.test(line) ||
    BULLET.test(line) ||
    NUMBERED.test(line) ||
    QUOTE.test(line)
  )
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  // Fora do fim vale linha vazia: o laco nunca le alem dela, e o tipo deixa de mentir.
  const at = (index: number): string => lines[index] ?? ''
  const blocks: MarkdownBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = at(i)

    if (line.trim().length === 0) {
      i += 1
      continue
    }

    // Bloco de codigo: tudo ate a cerca seguinte, como veio. Sem cerca de fechar, vai
    // ate o fim — e melhor mostrar o codigo inteiro do que sumir com metade dele.
    if (FENCE_OPEN.test(line)) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !FENCE_CLOSE.test(at(i))) {
        body.push(at(i))
        i += 1
      }
      i += 1
      blocks.push({ kind: 'code', text: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: (heading[1] ?? '#').length as 1 | 2 | 3,
        children: parseInline((heading[2] ?? '').trim()),
      })
      i += 1
      continue
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line)
      const marker = ordered ? NUMBERED : BULLET
      const start = ordered ? Number(NUMBERED.exec(line)?.[1] ?? 1) : 1
      const items: string[] = []

      while (i < lines.length && at(i).trim().length > 0) {
        const match = marker.exec(at(i))
        if (match) {
          items.push((ordered ? match[2] : match[1]) ?? '')
        } else if (/^\s{2,}\S/.test(at(i)) && items.length > 0) {
          // Linha recuada continua o item de cima, como no editor.
          items[items.length - 1] += `\n${at(i).trim()}`
        } else {
          break
        }
        i += 1
      }

      blocks.push({ kind: 'list', ordered, start, items: items.map((item) => parseInline(item)) })
      continue
    }

    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && QUOTE.test(at(i))) {
        body.push(QUOTE.exec(at(i))?.[1] ?? '')
        i += 1
      }
      blocks.push({ kind: 'quote', children: parseInline(body.join('\n')) })
      continue
    }

    // Paragrafo: ate a linha em branco ou o comeco de outro bloco. A quebra de linha
    // dentro dele vale como quebra — quem escreve um card nao pensa em dois espacos
    // no fim da linha.
    const body: string[] = []
    while (i < lines.length && at(i).trim().length > 0 && !startsBlock(at(i))) {
      body.push(at(i).trim())
      i += 1
    }
    blocks.push({ kind: 'paragraph', children: parseInline(body.join('\n')) })
  }

  return blocks
}

/** Os caracteres que a barra invertida devolve como texto. */
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>'])

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char)

/**
 * O texto de dentro de um bloco. Le da esquerda para a direita, e a marca que nao
 * fecha vira o texto que era — `2 * 3` continua `2 * 3`.
 */
export function parseInline(source: string): MarkdownInline[] {
  return parseSpans(source, false)
}

/**
 * `dentroDeLink`: o rotulo de um link nao tem link dentro — nem `[...](...)` nem
 * endereco solto. Link dentro de link e um `<a>` dentro de outro, que o navegador
 * desmonta do jeito dele.
 */
function parseSpans(source: string, dentroDeLink: boolean): MarkdownInline[] {
  const out: MarkdownInline[] = []
  let text = ''
  let i = 0

  const flush = () => {
    if (text.length > 0) {
      out.push({ kind: 'text', text })
      text = ''
    }
  }

  while (i < source.length) {
    const char = source.charAt(i)

    if (char === '\\' && ESCAPABLE.has(source[i + 1] ?? '')) {
      text += source.charAt(i + 1)
      i += 2
      continue
    }

    if (char === '\n') {
      flush()
      out.push({ kind: 'break' })
      i += 1
      continue
    }

    // Codigo: a sequencia de crases que abre fecha numa do mesmo tamanho. Assim
    // ``a `b` c`` guarda as crases de dentro. Sem fechamento, as crases ficam como o
    // texto que eram.
    if (char === '`') {
      let run = 1
      while (source[i + run] === '`') run += 1
      const close = findBackticks(source, run, i + run)
      if (close < 0) {
        text += '`'.repeat(run)
        i += run
        continue
      }
      flush()
      out.push({ kind: 'code', text: codeText(source.slice(i + run, close)) })
      i = close + run
      continue
    }

    if (char === '*' && source[i + 1] === '*') {
      const close = findClosing(source, '**', i + 2)
      if (close > i + 2) {
        flush()
        out.push({ kind: 'strong', children: parseSpans(source.slice(i + 2, close), dentroDeLink) })
        i = close + 2
        continue
      }
    }

    // Italico com `*` ou `_`. O `_` so abre e fecha na borda da palavra: no meio de
    // `nome_do_arquivo` ele e so um sublinhado.
    if ((char === '*' || char === '_') && !/\s/.test(source[i + 1] ?? ' ')) {
      const opensHere = char === '*' || !isWordChar(source[i - 1])
      const close = opensHere ? findClosing(source, char, i + 1) : -1
      if (close > i + 1 && (char === '*' || !isWordChar(source[close + 1]))) {
        flush()
        out.push({ kind: 'em', children: parseSpans(source.slice(i + 1, close), dentroDeLink) })
        i = close + 1
        continue
      }
    }

    if (char === '[' && !dentroDeLink) {
      const link = readLink(source, i)
      if (link) {
        flush()
        out.push(link.node)
        i = link.end
        continue
      }
    }

    // Endereco solto vira link, sem a pontuacao que costuma vir colada nele no fim
    // da frase.
    if (
      !dentroDeLink &&
      (char === 'h' || char === 'H') &&
      /^https?:\/\//i.test(source.slice(i, i + 8))
    ) {
      const match = /^https?:\/\/[^\s<>"]+/i.exec(source.slice(i))
      const href = (match?.[0] ?? '').replace(/[.,;:!?)\]'"]+$/, '')
      if (href.length > 'https://'.length) {
        flush()
        out.push({ kind: 'link', href, children: [{ kind: 'text', text: href }] })
        i += href.length
        continue
      }
    }

    text += char
    i += 1
  }

  flush()
  return out
}

/**
 * Onde a marca fecha, pulando o que esta escapado. -1 quando nao fecha.
 *
 * **Le a sequencia inteira de marcas, e nao uma por uma.** A do tamanho da marca
 * fecha. Uma de tres fecha as duas de uma vez: em `***isto***` e em `**a *b***`, o
 * negrito fecha com as duas ultimas e o italico de dentro com a primeira; em
 * `*a **b***`, o italico com a ultima. A de tamanho errado e de outra marca — o
 * `**` dentro de `*a **b***` e um negrito, e nao o fim do italico — e fica para ela.
 * Encostada no espaco, a sequencia so abre.
 */
function findClosing(source: string, marker: string, from: number): number {
  const char = marker.charAt(0)
  for (let i = from; i <= source.length - marker.length; i += 1) {
    if (source[i] === '\\') {
      i += 1
      continue
    }
    if (source[i] === '\n' && source[i + 1] === '\n') return -1
    if (source[i] !== char) continue

    let run = 1
    while (source[i + run] === char) run += 1
    if (!/\s/.test(source[i - 1] ?? ' ') && (run === marker.length || run >= 3)) {
      return i + run - marker.length
    }
    i += run - 1
  }
  return -1
}

/** A proxima sequencia de exatamente `run` crases, a partir de `from`; -1 sem ela. */
function findBackticks(source: string, run: number, from: number): number {
  let i = source.indexOf('`', from)
  while (i >= 0) {
    let length = 1
    while (source[i + length] === '`') length += 1
    if (length === run) return i
    i = source.indexOf('`', i + length)
  }
  return -1
}

/**
 * O codigo como se le: a quebra de linha vira espaco, e sai o espaco que separa a
 * crase de um codigo que comeca ou termina em crase (`` `` `a` `` ``).
 */
function codeText(raw: string): string {
  const text = raw.replace(/\n/g, ' ')
  return text.length >= 2 && text.startsWith(' ') && text.endsWith(' ') && text.trim().length > 0
    ? text.slice(1, -1)
    : text
}

/**
 * `[texto](endereco)`. Endereco fora de `http`, `https` e `mailto` nao vira link: a
 * marca inteira fica como texto, para quem le ver o que foi escrito.
 */
function readLink(source: string, start: number): { node: MarkdownInline; end: number } | null {
  const closeLabel = source.indexOf('](', start + 1)
  if (closeLabel < 0 || source.slice(start + 1, closeLabel).includes('\n')) return null

  const closeHref = source.indexOf(')', closeLabel + 2)
  if (closeHref < 0) return null

  const label = source.slice(start + 1, closeLabel)
  const href = source.slice(closeLabel + 2, closeHref).trim()

  if (label.length === 0 || !SAFE_LINK.test(href) || /\s/.test(href)) return null

  return {
    node: { kind: 'link', href, children: parseSpans(label, true) },
    end: closeHref + 1,
  }
}
