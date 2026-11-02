// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from '@/shared/components/Modal'
import { Toaster } from '@/shared/components/Toaster'
import { toast, useToastStore } from '@/shared/components/toastStore'

/**
 * O QUE ESTES TESTES TRAVAM: onde o aviso aparece, e como o leitor de tela o ouve.
 *
 * - **Com um dialogo aberto, o aviso nasce dentro dele** — o de cima, quando ha dois.
 *   Fora, ele caia em cima do X e do status do card, o clique nele contava como clique
 *   fora (e fechava o card com o que se escrevia), e o leitor de tela nao o lia: o
 *   dialogo esconde o resto da pagina. Fechado o dialogo, o aviso volta ao alto da
 *   pagina.
 * - **O erro e `alert`; a confirmacao, `status`.**
 * - **O aviso some sozinho em 5 s; com botao, fica 12 s**, e o botao roda e fecha. O
 *   erro so sai no X, e o ponteiro em cima para a contagem.
 *   "Fechar aviso" tira so aquele.
 */

/** O card aberto, e dentro dele um dialogo que abre por cima — o de pedir informacao. */
function DoisDialogos() {
  const [card, setCard] = useState(false)
  const [pergunta, setPergunta] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setCard(true)}>
        Abrir o card
      </button>
      <Modal open={card} onOpenChange={setCard} title="O card" closeButton>
        <button type="button" onClick={() => setPergunta(true)}>
          Pedir informação
        </button>
        <Modal open={pergunta} onOpenChange={setPergunta} title="A pergunta" closeButton>
          <p>dentro da pergunta</p>
        </Modal>
      </Modal>
      <Toaster />
    </>
  )
}

/** A regiao dos avisos, pelo aviso que esta nela. */
function regiaoDe(mensagem: string): HTMLElement {
  return screen.getByText(mensagem).closest('[data-toasts]') as HTMLElement
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  useToastStore.setState({ toasts: [], hosts: [] })
})

describe('onde o aviso aparece', () => {
  it('sem dialogo, no alto da pagina; com um, dentro dele; com dois, no de cima, e volta ao fechar', async () => {
    render(<DoisDialogos />)

    act(() => {
      toast.done('Sem dialogo.')
    })
    expect(regiaoDe('Sem dialogo.').closest('[role="dialog"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir o card' }))
    const card = await screen.findByRole('dialog', { name: 'O card' })
    // O aviso que ja estava na tela vai junto para dentro do card.
    expect(card.contains(regiaoDe('Sem dialogo.'))).toBe(true)

    fireEvent.click(within(card).getByRole('button', { name: 'Pedir informação' }))
    const pergunta = await screen.findByRole('dialog', { name: 'A pergunta' })
    act(() => {
      toast.error('Não deu para pedir.')
    })
    expect(pergunta.contains(regiaoDe('Não deu para pedir.'))).toBe(true)
    expect(useToastStore.getState().hosts).toEqual([card, pergunta])

    // Fechada a de cima, os avisos voltam para o card.
    fireEvent.keyDown(pergunta, { key: 'Escape' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'A pergunta' })).toBeNull())
    expect(card.contains(regiaoDe('Não deu para pedir.'))).toBe(true)

    // Fechado o card, para o alto da pagina.
    fireEvent.keyDown(card, { key: 'Escape' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(regiaoDe('Não deu para pedir.').closest('[role="dialog"]')).toBeNull()
    expect(useToastStore.getState().hosts).toEqual([])
  })
})

describe('o aviso', () => {
  it('o erro e alerta e a confirmacao e status; "Fechar aviso" tira so aquele', () => {
    render(<Toaster />)
    act(() => {
      toast.done('Comentário apagado.')
      toast.error('Não deu para mover o card.')
    })

    const erro = screen.getByRole('alert')
    expect(erro.textContent).toContain('Não deu para mover o card.')
    expect(screen.getByRole('status').textContent).toContain('Comentário apagado.')

    fireEvent.click(within(erro).getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Comentário apagado.')).toBeTruthy()
  })

  it('some sozinho em 5 s; com botao, fica 12 s, e o botao roda e fecha o aviso', () => {
    vi.useFakeTimers()
    const desfazer = vi.fn()
    render(<Toaster />)
    act(() => {
      toast.done('#12 movido.')
      toast.done('#13 movido.', { action: { label: 'Desfazer', run: desfazer } })
    })

    act(() => vi.advanceTimersByTime(4999))
    expect(screen.getByText('#12 movido.')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('#12 movido.')).toBeNull()
    // Quem tem botao continua: ninguem acha e clica um botao em cinco segundos.
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.getByText('#13 movido.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(desfazer).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('#13 movido.')).toBeNull()
  })

  it('o aviso com botao que ninguem clicou sai aos 12 s', () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      toast.done('#13 movido.', { action: { label: 'Desfazer', run: vi.fn() } })
    })
    act(() => vi.advanceTimersByTime(11_999))
    expect(screen.getByText('#13 movido.')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('#13 movido.')).toBeNull()
  })

  it('o erro fica ate ser fechado: quem le devagar nao perde o que deu errado', () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      toast.error('Não deu para salvar agora.')
    })
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText('Não deu para salvar agora.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByText('Não deu para salvar agora.')).toBeNull()
  })

  it('o ponteiro em cima para a contagem, e sair retoma de onde parou', () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      toast.done('#14 movido.')
    })
    act(() => vi.advanceTimersByTime(3000))
    const aviso = screen.getByRole('status')
    fireEvent.pointerEnter(aviso)
    act(() => vi.advanceTimersByTime(10_000))
    expect(screen.getByText('#14 movido.')).toBeTruthy()
    fireEvent.pointerLeave(aviso)
    act(() => vi.advanceTimersByTime(1999))
    expect(screen.getByText('#14 movido.')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('#14 movido.')).toBeNull()
  })
})
