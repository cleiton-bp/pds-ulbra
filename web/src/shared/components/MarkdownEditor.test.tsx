// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownEditor } from '@/shared/components/MarkdownEditor'

/**
 * O QUE ESTES TESTES TRAVAM: o editor da descricao do card.
 *
 * - **O botao "Lista" numa linha deixa o cursor no fim, sem selecionar nada.** Com o
 *   marcador selecionado, a primeira tecla o trocava pelo que se digitava, e a lista
 *   comecada pelo botao virava texto corrido.
 * - **Ao abrir pelo clique na descricao, o foco entra no texto, com o cursor no fim.**
 * - **Os atalhos de sempre valem** (Ctrl ou ⌘ com B), e "Visualizar" desenha como o card.
 */
function Editor({ inicial = '', autoFocus = false }: { inicial?: string; autoFocus?: boolean }) {
  const [texto, setTexto] = useState(inicial)
  return (
    <MarkdownEditor label="Descrição" value={texto} onChange={setTexto} autoFocus={autoFocus} />
  )
}

const campo = () => screen.getByRole('textbox', { name: 'Descrição' }) as HTMLTextAreaElement

afterEach(cleanup)

describe('o editor da descricao', () => {
  it('"Lista" numa linha: o marcador entra, o cursor fica depois dele, e o que se digita nao o apaga', () => {
    render(<Editor />)
    campo().focus()

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    expect(campo().value).toBe('- ')
    expect(document.activeElement).toBe(campo())
    expect([campo().selectionStart, campo().selectionEnd]).toEqual([2, 2])

    // A tecla seguinte entra depois do marcador, como no navegador com nada selecionado.
    const { selectionStart, selectionEnd, value } = campo()
    fireEvent.change(campo(), {
      target: { value: `${value.slice(0, selectionStart)}c${value.slice(selectionEnd)}` },
    })
    expect(campo().value).toBe('- c')
  })

  it('"Lista numerada" no meio de uma linha: a linha inteira, e o cursor no fim dela', () => {
    render(<Editor inicial={'Passos:\ncomprar pao\nfim'} />)
    campo().focus()
    campo().setSelectionRange(12, 12)

    fireEvent.click(screen.getByRole('button', { name: 'Lista numerada' }))
    expect(campo().value).toBe('Passos:\n1. comprar pao\nfim')
    const fimDaLinha = 'Passos:\n1. comprar pao'.length
    expect([campo().selectionStart, campo().selectionEnd]).toEqual([fimDaLinha, fimDaLinha])
  })

  it('aberto pelo clique na descricao, o foco entra no texto com o cursor no fim', () => {
    render(<Editor inicial="Trocar o gateway antes da virada." autoFocus />)
    expect(document.activeElement).toBe(campo())
    expect(campo().selectionStart).toBe(campo().value.length)
    expect(campo().selectionEnd).toBe(campo().value.length)
  })

  it('sem pedir, o foco nao vem para o editor', () => {
    render(<Editor inicial="Trocar o gateway." />)
    expect(document.activeElement).not.toBe(campo())
  })

  it('Ctrl+B poe o negrito na selecao; "Visualizar" desenha como o card', () => {
    render(<Editor inicial="ver isto agora" />)
    campo().focus()
    campo().setSelectionRange(4, 8)

    fireEvent.keyDown(campo(), { key: 'b', ctrlKey: true })
    expect(campo().value).toBe('ver **isto** agora')

    fireEvent.click(screen.getByRole('button', { name: 'Visualizar' }))
    const previa = screen.getByRole('region', { name: 'Prévia da descrição' })
    expect(previa.querySelector('strong')?.textContent).toBe('isto')
    fireEvent.click(screen.getByRole('button', { name: 'Escrever' }))
    expect(campo().value).toBe('ver **isto** agora')
  })
})
