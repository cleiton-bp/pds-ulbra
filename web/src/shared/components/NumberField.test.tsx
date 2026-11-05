// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { NumberField } from '@/shared/components/NumberField'

/**
 * O QUE ESTES TESTES TRAVAM: o campo continua um numero de verdade (o leitor de tela o ve
 * como spinbutton), os botoes andam um passo e desligam na borda, e a unidade fica ao
 * lado do numero sem entrar no nome dele.
 */
function Campo({ inicial = '15' }: { inicial?: string }) {
  const [valor, setValor] = useState(inicial)
  return (
    <NumberField
      value={valor}
      onChange={setValor}
      min={1}
      max={60}
      unit="min"
      ariaLabel="Validade, em minutos"
    />
  )
}

afterEach(cleanup)

describe('NumberField', () => {
  it('é um spinbutton com o nome dado, e a unidade fica ao lado sem entrar no nome', () => {
    render(<Campo />)
    const campo = screen.getByRole('spinbutton', { name: 'Validade, em minutos' })
    expect((campo as HTMLInputElement).value).toBe('15')
    expect(screen.getByText('min')).toBeTruthy()
  })

  it('os botões andam um passo e desligam na borda', () => {
    const { container } = render(<Campo inicial="59" />)
    const [menos, mais] = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]

    fireEvent.click(mais as HTMLButtonElement)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('60')
    expect(mais?.disabled).toBe(true)

    fireEvent.click(menos as HTMLButtonElement)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('59')
    expect(mais?.disabled).toBe(false)
  })
})
