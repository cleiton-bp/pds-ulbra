// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AskInfoDialog } from '@/features/reports/AskInfoDialog'

/**
 * O QUE ESTES TESTES TRAVAM: o dialogo de pedir uma informacao a quem relatou.
 *
 * - **Pedir pede o que falta**: sem texto, o botao fica desligado; o texto vai aparado.
 * - **Com texto escrito, o clique fora nao fecha** — errar a caixa nao leva o texto
 *   junto. O Esc e o "Cancelar" continuam fechando; sem texto, o clique fora fecha.
 * - **Enviando, nada fecha o dialogo**: a pergunta ja esta a caminho.
 */

/**
 * O clique fora da caixa, como o navegador o entrega: o Radix desta versao so fecha no
 * `click` que segue o `pointerdown`, um instante depois. O relogio passa antes da janela
 * do duplo clique, em que o `Modal` ignora o clique fora logo ao abrir.
 */
async function clicarFora() {
  const real = performance.now.bind(performance)
  vi.spyOn(performance, 'now').mockImplementation(() => real() + 1000)
  await act(() => new Promise((pronto) => setTimeout(pronto, 10)))
  const fora = document.body
  fireEvent.pointerDown(fora, { button: 0, pointerType: 'mouse' })
  fireEvent.mouseDown(fora, { button: 0 })
  fireEvent.pointerUp(fora, { button: 0, pointerType: 'mouse' })
  fireEvent.mouseUp(fora, { button: 0 })
  fireEvent.click(fora, { button: 0 })
  await act(() => new Promise((pronto) => setTimeout(pronto, 10)))
}

function montar(enviando = false) {
  const aoConfirmar = vi.fn()
  const aoCancelar = vi.fn()
  render(<AskInfoDialog enviando={enviando} aoConfirmar={aoConfirmar} aoCancelar={aoCancelar} />)
  const dialogo = screen.getByRole('dialog', { name: 'Pedir uma informação' })
  return { aoConfirmar, aoCancelar, dialogo }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('pedir uma informacao', () => {
  it('sem texto, "Pedir" fica desligado; com texto, manda o que falta, aparado', () => {
    const { aoConfirmar, dialogo } = montar()
    const pedir = within(dialogo).getByRole('button', { name: 'Pedir' }) as HTMLButtonElement
    expect(pedir.disabled).toBe(true)

    fireEvent.change(within(dialogo).getByLabelText('O que falta'), {
      target: { value: '   ' },
    })
    expect(pedir.disabled).toBe(true)

    fireEvent.change(within(dialogo).getByLabelText('O que falta'), {
      target: { value: '  Em qual navegador?  ' },
    })
    fireEvent.click(pedir)
    expect(aoConfirmar).toHaveBeenCalledWith('Em qual navegador?')
  })

  it('com texto escrito, o clique fora nao fecha; o Esc e o "Cancelar" continuam', async () => {
    const { aoCancelar, dialogo } = montar()
    const campo = within(dialogo).getByLabelText('O que falta')
    fireEvent.change(campo, { target: { value: 'Em qual navegador?' } })

    await clicarFora()
    expect(aoCancelar).not.toHaveBeenCalled()

    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(aoCancelar).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(aoCancelar).toHaveBeenCalledTimes(2)
  })

  it('sem nada escrito, o clique fora fecha', async () => {
    const { aoCancelar } = montar()
    await clicarFora()
    expect(aoCancelar).toHaveBeenCalledTimes(1)
  })

  it('enviando, o Esc nao fecha, e os botoes esperam', () => {
    const { aoCancelar, dialogo } = montar(true)
    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(aoCancelar).not.toHaveBeenCalled()
    expect(
      (within(dialogo).getByRole('button', { name: 'Enviando…' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (within(dialogo).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
