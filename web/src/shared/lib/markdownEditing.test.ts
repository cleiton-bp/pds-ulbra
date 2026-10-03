import { describe, expect, it } from 'vitest'
import { applyFormat, type EditorState } from '@/shared/lib/markdownEditing'

/** O texto com a selecao marcada por `[` e `]`, para o teste ler como se ve. */
function estado(marcado: string): EditorState {
  const start = marcado.indexOf('[')
  const end = marcado.indexOf(']') - 1
  return {
    value: marcado.replace('[', '').replace(']', ''),
    selectionStart: start,
    selectionEnd: end,
  }
}

function marcado(state: EditorState): string {
  const { value, selectionStart: s, selectionEnd: e } = state
  return `${value.slice(0, s)}[${value.slice(s, e)}]${value.slice(e)}`
}

describe('a barra do editor', () => {
  it('negrito envolve a selecao, e clicar de novo desfaz', () => {
    const uma = applyFormat(estado('ver [isto] agora'), 'bold')
    expect(marcado(uma)).toBe('ver **[isto]** agora')
    expect(marcado(applyFormat(uma, 'bold'))).toBe('ver [isto] agora')
  })

  it('sem selecao, entra um texto de exemplo ja selecionado para trocar', () => {
    expect(marcado(applyFormat(estado('a[]b'), 'italic'))).toBe('a*[texto em itálico]*b')
  })

  it('italico e um `*`, que vale no meio da palavra; com o negrito, sao tres', () => {
    expect(marcado(applyFormat(estado('pre[fixo]'), 'italic'))).toBe('pre*[fixo]*')
    // Dentro do negrito, o italico entra sem desmanchar o negrito — e sai sozinho.
    const os2 = applyFormat(applyFormat(estado('ver [isto]'), 'bold'), 'italic')
    expect(marcado(os2)).toBe('ver ***[isto]***')
    expect(marcado(applyFormat(os2, 'italic'))).toBe('ver **[isto]**')
    expect(marcado(applyFormat(os2, 'bold'))).toBe('ver *[isto]*')
    expect(marcado(applyFormat(estado('**[isto]**'), 'italic'))).toBe('***[isto]***')
  })

  it('codigo numa linha e crase; em varias linhas e bloco', () => {
    expect(marcado(applyFormat(estado('rode [npm test]'), 'code'))).toBe('rode `[npm test]`')
    expect(marcado(applyFormat(estado('[a\nb]'), 'code'))).toBe('```\n[a\nb]\n```')
  })

  it('link: o texto selecionado vira o rotulo, e a selecao cai no endereco', () => {
    expect(marcado(applyFormat(estado('veja [o guia]'), 'link'))).toBe('veja [o guia]([https://])')
  })

  it('lista marca cada linha tocada, inteira, e clicar de novo desmarca', () => {
    const lista = applyFormat(estado('um\nd[ois\ntr]es'), 'bulleted')
    expect(lista.value).toBe('um\n- dois\n- tres')
    expect(applyFormat(lista, 'bulleted').value).toBe('um\ndois\ntres')
  })

  it('lista numerada numera na ordem', () => {
    expect(applyFormat(estado('[a\nb\nc]'), 'numbered').value).toBe('1. a\n2. b\n3. c')
  })
})
