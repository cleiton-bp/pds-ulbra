// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
 * - **Cada variavel e um bloco** no campo, com o nome em portugues, que nao se edita por
 *   dentro; o que se grava continua `{{variavel}}`.
 * - **O botao poe o bloco onde esta o cursor**, e troca o trecho marcado. Sem espaco no
 *   teto, nada entra: cortar partiria a variavel.
 * - **A variavel escrita a mao vira bloco**, e a de fora da lista fica como texto.
 * - **O que entra quando falta** tem um campo proprio, so com o primeiro nome no texto.
 * - **A previa troca as variaveis pelos valores de exemplo.**
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

const campo = () => screen.getByRole('textbox', { name: 'Confirmação' }) as HTMLDivElement
const blocos = () => [...campo().querySelectorAll<HTMLElement>('[data-variavel]')]
/** O texto que a pessoa ve no campo, sem os marcadores invisiveis do cursor. */
const visto = () => (campo().textContent ?? '').replaceAll('\u200B', '')

/** Poe o cursor (ou marca um trecho) dentro do primeiro texto do campo. */
function marcar(inicio: number, fim = inicio) {
  const texto = [...campo().childNodes].find(
    (no) => no.nodeType === Node.TEXT_NODE && (no.nodeValue ?? '').replaceAll('\u200B', '') !== '',
  ) as Text
  const trecho = document.createRange()
  trecho.setStart(texto, inicio)
  trecho.setEnd(texto, fim)
  const selecao = window.getSelection()
  selecao?.removeAllRanges()
  selecao?.addRange(trecho)
}

describe('TemplateField', () => {
  afterEach(cleanup)

  it('um botao por variavel aceita, com o nome em portugues', () => {
    render(<Controlado inicial="Oi" variables={['primeiroNome', 'protocolo', 'projeto']} />)

    expect(screen.getByRole('button', { name: 'primeiro nome' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'protocolo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'projeto' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'tipo' })).toBeNull()
  })

  it('a variavel aparece como um bloco nao editavel, com o nome em portugues', () => {
    render(<Controlado inicial="Obrigado, {{primeiroNome}}! Protocolo {{protocolo}}." />)

    expect(blocos().map((bloco) => bloco.textContent)).toEqual(['primeiro nome', 'protocolo'])
    expect(blocos().every((bloco) => bloco.contentEditable === 'false')).toBe(true)
    expect(visto()).toBe('Obrigado, primeiro nome! Protocolo protocolo.')
  })

  it('o botao poe o bloco onde esta o cursor, e o texto gravado leva a variavel escrita', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="Obrigado, !" aoMudar={aoMudar} />)

    marcar(10)
    fireEvent.click(screen.getByRole('button', { name: 'primeiro nome' }))

    expect(aoMudar).toHaveBeenLastCalledWith('Obrigado, {{primeiroNome}}!')
    expect(blocos()).toHaveLength(1)
    expect(visto()).toBe('Obrigado, primeiro nome!')
  })

  it('o trecho marcado e trocado pelo bloco', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="Protocolo XXXX." aoMudar={aoMudar} />)

    marcar(10, 14)
    fireEvent.click(screen.getByRole('button', { name: 'protocolo' }))

    expect(aoMudar).toHaveBeenLastCalledWith('Protocolo {{protocolo}}.')
  })

  it('sem cursor no campo, o bloco entra no fim', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="Recebemos" aoMudar={aoMudar} />)
    window.getSelection()?.removeAllRanges()

    fireEvent.click(screen.getByRole('button', { name: 'tipo' }))

    expect(aoMudar).toHaveBeenLastCalledWith('Recebemos{{tipo}}')
  })

  it('sem espaco no teto, a variavel nao entra pela metade: nada muda', () => {
    const aoMudar = vi.fn()
    // 'Oi ' + '{{tipo}}' teria 11 caracteres; o teto e 10.
    render(<Controlado inicial="Oi " maxLength={10} aoMudar={aoMudar} />)

    marcar(3)
    fireEvent.click(screen.getByRole('button', { name: 'tipo' }))

    expect(aoMudar).not.toHaveBeenCalled()
    expect(blocos()).toHaveLength(0)
  })

  it('a variavel escrita a mao vira bloco, e a de fora da lista fica como texto', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="" aoMudar={aoMudar} />)

    campo().textContent = 'Oi {{primeiroNome}}, etapa {{etapa}}'
    fireEvent.input(campo())

    expect(aoMudar).toHaveBeenLastCalledWith('Oi {{primeiroNome}}, etapa {{etapa}}')
    expect(blocos().map((bloco) => bloco.dataset.variavel)).toEqual(['primeiroNome'])
    expect(visto()).toBe('Oi primeiro nome, etapa {{etapa}}')
  })

  it('apagar o bloco tira a variavel inteira do texto gravado', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="Oi, {{primeiroNome}}!" aoMudar={aoMudar} />)

    blocos()[0]?.remove()
    fireEvent.input(campo())

    expect(aoMudar).toHaveBeenLastCalledWith('Oi, !')
  })

  it('o Ctrl+Z desfaz pelo historico do proprio campo, e o Ctrl+Shift+Z refaz', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="Oi " aoMudar={aoMudar} />)

    marcar(3)
    fireEvent.click(screen.getByRole('button', { name: 'primeiro nome' }))
    expect(aoMudar).toHaveBeenLastCalledWith('Oi {{primeiroNome}}')

    fireEvent.keyDown(campo(), { key: 'z', ctrlKey: true })
    expect(aoMudar).toHaveBeenLastCalledWith('Oi ')
    expect(blocos()).toHaveLength(0)

    fireEvent.keyDown(campo(), { key: 'z', ctrlKey: true, shiftKey: true })
    expect(aoMudar).toHaveBeenLastCalledWith('Oi {{primeiroNome}}')
    expect(blocos()).toHaveLength(1)
  })

  it('o Enter nao quebra a linha: o site mostra o texto num paragrafo so', () => {
    render(<Controlado inicial="Oi" />)
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    campo().dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true)
  })

  it('o que entra quando falta o nome tem um campo proprio, e vai no texto gravado', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="Oi, {{primeiroNome}}." aoMudar={aoMudar} />)

    const padrao = screen.getByLabelText(
      'Quando a pessoa não disser o nome, escrever',
    ) as HTMLInputElement
    expect(padrao.value).toBe('')
    expect(padrao.placeholder).toBe('você')

    fireEvent.change(padrao, { target: { value: 'nossa {cliente}' } })
    expect(aoMudar).toHaveBeenLastCalledWith('Oi, {{primeiroNome|nossa cliente}}.')
    expect(screen.getByText('Oi, nossa cliente.')).toBeTruthy()

    fireEvent.change(padrao, { target: { value: '' } })
    expect(aoMudar).toHaveBeenLastCalledWith('Oi, {{primeiroNome}}.')
  })

  it('sem o primeiro nome no texto, nao ha campo do que entra quando falta', () => {
    render(<Controlado inicial="Protocolo {{protocolo}}." />)

    expect(screen.queryByLabelText('Quando a pessoa não disser o nome, escrever')).toBeNull()
  })

  it('a previa troca as variaveis pelos valores de exemplo, e acompanha o que se insere', () => {
    render(<Controlado inicial="Recebemos o seu {{tipo}} em {{projeto}}." />)

    expect(screen.getByText('Recebemos o seu Defeito em Loja.')).toBeTruthy()
    // Sem o primeiro nome no texto, a linha "sem nome" nao diz nada, e nao aparece.
    expect(screen.queryByText('sem nome:')).toBeNull()

    marcar(0)
    fireEvent.click(screen.getByRole('button', { name: 'protocolo' }))

    expect(screen.getByText('ABCD-1234Recebemos o seu Defeito em Loja.')).toBeTruthy()
  })

  it('com o primeiro nome no texto, a previa mostra tambem como fica sem nome', () => {
    render(<Controlado inicial="Obrigado, {{primeiroNome}}! Protocolo {{protocolo}}." />)

    expect(screen.getByText('Obrigado, Ana! Protocolo ABCD-1234.')).toBeTruthy()
    expect(screen.getByText('sem nome:')).toBeTruthy()
    expect(screen.getByText('Obrigado, você! Protocolo ABCD-1234.')).toBeTruthy()
  })

  it('o padrao gravado no texto vale na linha sem nome, e aparece no campo dele', () => {
    render(<Controlado inicial="Oi, {{primeiroNome|pessoa}}." />)

    expect(screen.getByText('Oi, Ana.')).toBeTruthy()
    expect(screen.getByText('Oi, pessoa.')).toBeTruthy()
    expect(
      (screen.getByLabelText('Quando a pessoa não disser o nome, escrever') as HTMLInputElement)
        .value,
    ).toBe('pessoa')
  })

  it('texto sem variavel nao tem botao nem previa', () => {
    render(<Controlado inicial="Texto comprido" variables={[]} />)

    expect(screen.queryByText('Inserir:')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    // So o proprio campo tem o texto: nenhuma previa repetindo.
    expect(screen.queryByText('Texto comprido', { selector: 'p' })).toBeNull()
    expect(visto()).toBe('Texto comprido')
  })
})
