/**
 * O que cada botao da barra do editor faz com o texto e com a selecao.
 *
 * **Funcoes puras**: recebem o texto e onde a selecao esta, e devolvem o texto
 * novo e onde a selecao fica. A barra so chama — e o comportamento se prova em
 * teste sem montar editor nenhum.
 *
 * **O botao escreve a marcacao, e nao a esconde.** Quem nao conhece Markdown
 * aprende vendo o `**` aparecer; quem conhece digita direto. Clicar de novo com a
 * mesma selecao desfaz, como num editor de texto.
 */

export interface EditorState {
  value: string
  selectionStart: number
  selectionEnd: number
}

export type FormatAction = 'bold' | 'italic' | 'code' | 'link' | 'bulleted' | 'numbered'

/** O que entra quando nao ha nada selecionado, ja selecionado para ser trocado. */
const PLACEHOLDER: Record<'bold' | 'italic' | 'code' | 'link', string> = {
  bold: 'texto em negrito',
  italic: 'texto em itálico',
  code: 'código',
  link: 'texto do link',
}

export function applyFormat(state: EditorState, action: FormatAction): EditorState {
  switch (action) {
    case 'bold':
      return toggleWrap(state, '**', PLACEHOLDER.bold)
    // `*`, e nao `_`: o `_` no meio da palavra e so sublinhado, e o italico de
    // um pedaco dela nao apareceria.
    case 'italic':
      return toggleWrap(state, '*', PLACEHOLDER.italic)
    case 'code':
      return state.value.slice(state.selectionStart, state.selectionEnd).includes('\n')
        ? fence(state)
        : toggleWrap(state, '`', PLACEHOLDER.code)
    case 'link':
      return link(state)
    case 'bulleted':
      return togglePrefix(state, () => '- ', /^- /)
    case 'numbered':
      return togglePrefix(state, (index) => `${index + 1}. `, /^\d+\. /)
  }
}

/** Envolve a selecao com a marca — ou tira, se ela ja esta envolvida. */
function toggleWrap(state: EditorState, marker: string, placeholder: string): EditorState {
  const { value, selectionStart: start, selectionEnd: end } = state
  const before = value.slice(start - marker.length, start)
  const after = value.slice(end, end + marker.length)
  // Um `*` e o italico, e dois sao o negrito: a selecao dentro de `**isto**` nao esta
  // em italico, e dentro de `***isto***` esta nos dois.
  const wrapped =
    marker === '*'
      ? stars(value, start, -1) % 2 === 1 && stars(value, end, 1) % 2 === 1
      : before === marker && after === marker

  if (start !== end && wrapped) {
    return {
      value:
        value.slice(0, start - marker.length) +
        value.slice(start, end) +
        value.slice(end + marker.length),
      selectionStart: start - marker.length,
      selectionEnd: end - marker.length,
    }
  }

  const selected = start === end ? placeholder : value.slice(start, end)
  return {
    value: value.slice(0, start) + marker + selected + marker + value.slice(end),
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + selected.length,
  }
}

/** Quantos `*` seguidos encostam na posicao — para tras (-1) ou para frente (1). */
function stars(value: string, at: number, direction: -1 | 1): number {
  let count = 0
  for (let i = direction === -1 ? at - 1 : at; value[i] === '*'; i += direction) count += 1
  return count
}

/** Varias linhas viram bloco de codigo, cada cerca na propria linha. */
function fence(state: EditorState): EditorState {
  const { value, selectionStart: start, selectionEnd: end } = state
  const selected = value.slice(start, end)
  const opening = start === 0 || value[start - 1] === '\n' ? '```\n' : '\n```\n'
  const closing = end === value.length || value[end] === '\n' ? '\n```' : '\n```\n'

  return {
    value: value.slice(0, start) + opening + selected + closing + value.slice(end),
    selectionStart: start + opening.length,
    selectionEnd: start + opening.length + selected.length,
  }
}

/**
 * `[texto](https://)`. Com texto selecionado, ele vira o rotulo e a selecao cai no
 * endereco, que e o que falta escrever; sem nada, a selecao cai no rotulo.
 */
function link(state: EditorState): EditorState {
  const { value, selectionStart: start, selectionEnd: end } = state
  const selected = value.slice(start, end)
  const label = selected.length > 0 ? selected : PLACEHOLDER.link
  const url = 'https://'
  const inserted = `[${label}](${url})`

  return selected.length > 0
    ? {
        value: value.slice(0, start) + inserted + value.slice(end),
        selectionStart: start + label.length + 3,
        selectionEnd: start + label.length + 3 + url.length,
      }
    : {
        value: value.slice(0, start) + inserted + value.slice(end),
        selectionStart: start + 1,
        selectionEnd: start + 1 + label.length,
      }
}

/**
 * Lista: marca cada linha tocada pela selecao — inteira, mesmo que a selecao comece
 * no meio dela. Se todas ja estao marcadas, tira.
 */
function togglePrefix(
  state: EditorState,
  prefixFor: (index: number) => string,
  existing: RegExp,
): EditorState {
  const { value, selectionStart: start, selectionEnd: end } = state
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const nextBreak = value.indexOf('\n', end)
  const lineEnd = nextBreak < 0 ? value.length : nextBreak

  const lines = value.slice(lineStart, lineEnd).split('\n')
  const allMarked = lines.every((line) => existing.test(line))
  const changed = allMarked
    ? lines.map((line) => line.replace(existing, ''))
    : lines.map((line, index) => prefixFor(index) + line.replace(existing, ''))
  const block = changed.join('\n')

  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + block.length,
  }
}
