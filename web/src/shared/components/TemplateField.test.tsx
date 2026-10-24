// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TemplateField } from '@/shared/components/TemplateField'
import {
  SUCCESS_VARIABLES,
  type WidgetTextValues,
  type WidgetTextVariable,
} from '@/shared/lib/widgetText'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * - **O botao da variavel poe `{{variavel}}` onde esta o cursor**, ja escrita certo, e
 *   troca o trecho marcado. Sem espaco no teto, nada entra: cortar partiria a variavel.
 * - **A previa troca as variaveis pelos valores de exemplo**, e mostra a linha "sem nome"
 *   so quando o texto usa o primeiro nome.
 * - Texto sem variavel nao tem botao nem previa.
 */

const AMOSTRA: WidgetTextValues = {
  primeiroNome: 'Ana',
  protocolo: 'ABCD-1234',
  tipo: 'Defeito',
  projeto: 'Loja',
}

/** O campo com o valor guardado, como a tela usa — e cada mudanca anotada. */
function Controlado({
  inicial,
  maxLength = 200,
  variables = SUCCESS_VARIABLES,
  aoMudar = () => {},
}: {
  inicial: string
  maxLength?: number
  variables?: readonly WidgetTextVariable[]
  aoMudar?: (valor: string) => void
}) {
  const [valor, setValor] = useState(inicial)
  return (
    <TemplateField
      label="Confirmação"
      value={valor}
      onChange={(novo) => {
        aoMudar(novo)
        setValor(novo)
      }}
      maxLength={maxLength}
      variables={variables}
      sample={AMOSTRA}
    />
  )
}

const campo = () => screen.getByRole('textbox', { name: 'Confirmação' }) as HTMLTextAreaElement

describe('TemplateField', () => {
  afterEach(cleanup)

  it('um botao por variavel aceita, com o nome em portugues', () => {
    render(<Controlado inicial="Oi" variables={['primeiroNome', 'protocolo', 'projeto']} />)

    expect(screen.getByRole('button', { name: 'primeiro nome' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'protocolo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'projeto' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'tipo' })).toBeNull()
  })

  it('o botao poe a variavel onde esta o cursor, e o cursor vai para depois dela', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="Obrigado, !" aoMudar={aoMudar} />)

    campo().setSelectionRange(10, 10)
    fireEvent.click(screen.getByRole('button', { name: 'primeiro nome' }))

    expect(aoMudar).toHaveBeenCalledWith('Obrigado, {{primeiroNome}}!')
    expect(campo().value).toBe('Obrigado, {{primeiroNome}}!')
    // Como se a variavel tivesse sido digitada: o cursor logo depois dela.
    const depois = 10 + '{{primeiroNome}}'.length
    await waitFor(() => expect(campo().selectionStart).toBe(depois))
    expect(campo().selectionEnd).toBe(depois)
  })

  it('o trecho marcado e trocado pela variavel', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="Protocolo XXXX." aoMudar={aoMudar} />)

    campo().setSelectionRange(10, 14)
    fireEvent.click(screen.getByRole('button', { name: 'protocolo' }))

    expect(aoMudar).toHaveBeenCalledWith('Protocolo {{protocolo}}.')
  })

  it('sem espaco no teto, a variavel nao entra pela metade: nada muda', () => {
    const aoMudar = vi.fn()
    // 'Oi ' + '{{tipo}}' teria 11 caracteres; o teto e 10.
    render(<Controlado inicial="Oi " maxLength={10} aoMudar={aoMudar} />)

    campo().setSelectionRange(3, 3)
    fireEvent.click(screen.getByRole('button', { name: 'tipo' }))

    expect(aoMudar).not.toHaveBeenCalled()
    expect(campo().value).toBe('Oi ')
  })

  it('a previa troca as variaveis pelos valores de exemplo, e acompanha o que se insere', () => {
    render(<Controlado inicial="Recebemos o seu {{tipo}} em {{projeto}}." />)

    expect(screen.getByText('Recebemos o seu Defeito em Loja.')).toBeTruthy()
    // Sem o primeiro nome no texto, a linha "sem nome" nao diz nada, e nao aparece.
    expect(screen.queryByText('sem nome:')).toBeNull()

    campo().setSelectionRange(0, 0)
    fireEvent.click(screen.getByRole('button', { name: 'protocolo' }))

    expect(screen.getByText('ABCD-1234Recebemos o seu Defeito em Loja.')).toBeTruthy()
  })

  it('com o primeiro nome no texto, a previa mostra tambem como fica sem nome', () => {
    render(<Controlado inicial="Obrigado, {{primeiroNome}}! Protocolo {{protocolo}}." />)

    expect(screen.getByText('Obrigado, Ana! Protocolo ABCD-1234.')).toBeTruthy()
    expect(screen.getByText('sem nome:')).toBeTruthy()
    expect(screen.getByText('Obrigado, você! Protocolo ABCD-1234.')).toBeTruthy()
  })

  it('o padrao escrito no texto vale na linha sem nome', () => {
    render(<Controlado inicial="Oi, {{primeiroNome|pessoa}}." />)

    expect(screen.getByText('Oi, Ana.')).toBeTruthy()
    expect(screen.getByText('Oi, pessoa.')).toBeTruthy()
  })

  it('texto sem variavel nao tem botao nem previa', () => {
    render(<Controlado inicial="Texto comprido" variables={[]} />)

    expect(screen.queryByText('Inserir:')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    // So o proprio campo tem o texto: nenhuma previa repetindo.
    expect(screen.queryByText('Texto comprido', { selector: 'p' })).toBeNull()
    expect(campo().value).toBe('Texto comprido')
  })
})
