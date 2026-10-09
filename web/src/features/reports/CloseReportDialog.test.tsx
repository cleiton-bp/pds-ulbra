// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CloseReportDialog } from '@/features/reports/CloseReportDialog'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: o dialogo do motivo do encerramento.
 *
 * - **A frase diz o que vai acontecer**: mover para a coluna que encerra, encerrar sem
 *   sair do lugar, arquivar, ou o lote.
 * - **O motivo e obrigatorio**: sem ele, nada encerra; o desfecho escolhido vai junto.
 * - **Com o motivo escrito, o clique fora nao fecha** — e o texto que quem relatou vai
 *   ler. O Esc e o "Cancelar" continuam fechando; sem texto, o clique fora fecha.
 * - **Encerrando, nada fecha o dialogo.**
 */
instalarRemendosDoRadix()

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

function montar(props: Partial<ComponentProps<typeof CloseReportDialog>> = {}) {
  const aoConfirmar = vi.fn()
  const aoCancelar = vi.fn()
  render(
    <CloseReportDialog
      coluna="Feito"
      encerrando={false}
      aoConfirmar={aoConfirmar}
      aoCancelar={aoCancelar}
      {...props}
    />,
  )
  return { aoConfirmar, aoCancelar, dialogo: screen.getByRole('dialog') }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('o que o dialogo diz', () => {
  it('mover para a coluna que encerra, encerrar sem mover, arquivar e o lote', () => {
    montar()
    expect(
      screen.getByText(
        'Mover para Feito encerra este relato. Quem escreveu vai ler o motivo na página de acompanhamento.',
      ),
    ).toBeTruthy()
    cleanup()

    montar({ coluna: null })
    expect(screen.getByText(/continua na coluna em que está/)).toBeTruthy()
    cleanup()

    const { dialogo } = montar({ coluna: null, arquivando: true })
    expect(screen.getByRole('dialog', { name: 'Arquivar o relato' })).toBe(dialogo)
    expect(within(dialogo).getByRole('button', { name: 'Arquivar' })).toBeTruthy()
    cleanup()

    montar({ lote: 3 })
    expect(screen.getByRole('dialog', { name: 'Encerrar 3 relatos' })).toBeTruthy()
    expect(screen.getByText(/encerra os 3 relatos abertos da seleção/)).toBeTruthy()
  })
})

describe('o motivo', () => {
  it('sem motivo nada encerra; com ele, vai junto do desfecho escolhido, aparado', async () => {
    const { aoConfirmar, dialogo } = montar()
    const encerrar = within(dialogo).getByRole('button', { name: 'Encerrar' }) as HTMLButtonElement
    expect(encerrar.disabled).toBe(true)

    await escolherNoSelect(screen, fireEvent, 'Como terminou', 'Não será feito')
    fireEvent.change(within(dialogo).getByLabelText('Por que acabou'), {
      target: { value: '  Fora do que o produto faz.  ' },
    })
    fireEvent.click(encerrar)
    expect(aoConfirmar).toHaveBeenCalledWith('WontDo', 'Fora do que o produto faz.')
  })

  it('com o motivo escrito, o clique fora nao fecha; o Esc e o "Cancelar" continuam', async () => {
    const { aoCancelar, dialogo } = montar()
    const motivo = within(dialogo).getByLabelText('Por que acabou')
    fireEvent.change(motivo, { target: { value: 'Trocamos o gateway.' } })

    await clicarFora()
    expect(aoCancelar).not.toHaveBeenCalled()

    fireEvent.keyDown(motivo, { key: 'Escape' })
    expect(aoCancelar).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(aoCancelar).toHaveBeenCalledTimes(2)
  })

  it('sem nada escrito, o clique fora fecha', async () => {
    const { aoCancelar } = montar()
    await clicarFora()
    expect(aoCancelar).toHaveBeenCalledTimes(1)
  })

  it('encerrando, o Esc nao fecha, e os botoes esperam', () => {
    const { aoCancelar, dialogo } = montar({ encerrando: true })
    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(aoCancelar).not.toHaveBeenCalled()
    expect(
      (within(dialogo).getByRole('button', { name: 'Encerrando…' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
