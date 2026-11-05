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
 * - **O aviso fica sempre no alto da pagina**, com dialogo aberto ou nao: dentro do
 *   dialogo ele mudava de lugar a cada um. E continua lido pelo leitor de tela com o
 *   dialogo aberto, que esconde o resto da pagina: a regiao tem `aria-live`, e a
 *   biblioteca que esconde respeita isso. O clique nele nao fecha o dialogo (`Modal`).
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
  useToastStore.setState({ toasts: [] })
})

describe('onde o aviso aparece', () => {
  it('sempre no alto da pagina, com ou sem dialogo, e visivel ao leitor de tela', async () => {
    render(<DoisDialogos />)

    act(() => {
      toast.done('Sem dialogo.')
    })
    expect(regiaoDe('Sem dialogo.').closest('[role="dialog"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir o card' }))
    const card = await screen.findByRole('dialog', { name: 'O card' })
    fireEvent.click(within(card).getByRole('button', { name: 'Pedir informação' }))
    await screen.findByRole('dialog', { name: 'A pergunta' })
    act(() => {
      toast.error('Não deu para pedir.')
    })

    const regiao = regiaoDe('Não deu para pedir.')
    // Fora dos dois dialogos, no canto fixo de sempre.
    expect(regiao.closest('[role="dialog"]')).toBeNull()
    expect(regiao.className).toContain('fixed')
    // O dialogo esconde o resto da pagina do leitor de tela, menos a regiao dos avisos.
    expect(regiao.getAttribute('aria-live')).toBe('off')
    expect(regiao.closest('[aria-hidden="true"]')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('Não deu para pedir.')
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
