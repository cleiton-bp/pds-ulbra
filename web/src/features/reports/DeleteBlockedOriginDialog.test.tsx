// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeleteBlockedOriginDialog } from '@/features/reports/DeleteBlockedOriginDialog'

/**
 * O QUE ESTES TESTES TRAVAM: apagar de vez nao tem volta, e o botao so liga depois de
 * a pessoa escrever o dominio (quando todos vieram de um so) ou a palavra "apagar".
 * O que vai para a API e o escrito ja normalizado — a API confere a mesma regra.
 */

function montar(domain: string | null, count = 3) {
  const onConfirm = vi.fn(async (_confirmacao: string) => {})
  const onCancel = vi.fn()
  render(
    <DeleteBlockedOriginDialog
      count={count}
      domain={domain}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

const campo = () => screen.getByRole('textbox', { name: /^Para confirmar, escreva/ })
const apagar = (nome = /^Apagar \d+ cards? de vez$/) =>
  screen.getByRole('button', { name: nome }) as HTMLButtonElement

describe('DeleteBlockedOriginDialog', () => {
  afterEach(cleanup)

  it('diz quantos cards saem, e de onde', () => {
    montar('loja.com', 3)

    expect(screen.getByRole('dialog', { name: 'Apagar de vez 3 cards?' })).toBeTruthy()
    expect(screen.getByText('loja.com', { selector: 'code' })).toBeTruthy()
    expect(apagar(/^Apagar 3 cards de vez$/)).toBeTruthy()
  })

  it('no singular, fala de 1 card', () => {
    montar('loja.com', 1)

    expect(screen.getByRole('dialog', { name: 'Apagar de vez 1 card?' })).toBeTruthy()
    expect(apagar(/^Apagar 1 card de vez$/)).toBeTruthy()
  })

  it('so liga depois de escrever o dominio', async () => {
    const { onConfirm } = montar('loja.com')
    expect(campo().getAttribute('placeholder')).toBe('loja.com')
    expect(apagar().disabled).toBe(true)

    fireEvent.change(campo(), { target: { value: 'loja.co' } })
    expect(apagar().disabled).toBe(true)
    fireEvent.click(apagar())
    expect(onConfirm).not.toHaveBeenCalled()

    // Maiusculas e espacos em volta nao contam.
    fireEvent.change(campo(), { target: { value: '  Loja.COM ' } })
    expect(apagar().disabled).toBe(false)

    fireEvent.click(apagar())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('loja.com'))
  })

  it('a palavra "apagar" tambem confirma', async () => {
    const { onConfirm } = montar('loja.com')

    fireEvent.change(campo(), { target: { value: 'APAGAR' } })
    expect(apagar().disabled).toBe(false)

    fireEvent.click(apagar())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('apagar'))
  })

  it('vindos de mais de um dominio, so a palavra confirma', async () => {
    const { onConfirm } = montar(null)
    expect(screen.getByRole('textbox', { name: 'Para confirmar, escreva apagar' })).toBeTruthy()
    expect(screen.getByText(/domínios bloqueados/)).toBeTruthy()

    fireEvent.change(campo(), { target: { value: 'loja.com' } })
    expect(apagar().disabled).toBe(true)

    fireEvent.change(campo(), { target: { value: 'apagar' } })
    expect(apagar().disabled).toBe(false)
    fireEvent.keyDown(campo(), { key: 'Enter' })
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('apagar'))
  })

  it('o Enter com o texto errado nao apaga', () => {
    const { onConfirm } = montar('loja.com')

    fireEvent.change(campo(), { target: { value: 'nao' } })
    fireEvent.keyDown(campo(), { key: 'Enter' })

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancelar desiste sem apagar', () => {
    const { onConfirm, onCancel } = montar('loja.com')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
