// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReportAnswerViewModel } from '@/contracts'
import { ReportAnswers } from '@/shared/components/ReportAnswers'

/**
 * O QUE ESTES TESTES TRAVAM: o relato lido como foi respondido.
 *
 * - **Cada resposta embaixo da pergunta** que a pediu, na ordem em que chegaram.
 * - **A caixa livre depois de perguntas ganha o rotulo "Mais detalhes"**: sem ele, ela
 *   pareceria a resposta da ultima pergunta. Sozinha, vai sem rotulo nenhum.
 * - **Sem respostas, o texto** como a pessoa escreveu, com as quebras de linha.
 * - **Com respostas, o texto nao se repete**: ele e as mesmas respostas juntas.
 */
afterEach(cleanup)

const TEXTO = 'Pagar com Pix\n\nNada acontece\n\nUsei o celular'

const termos = (lista: HTMLElement) =>
  Array.from(lista.querySelectorAll('dt')).map((item) => item.textContent)
const definicoes = (lista: HTMLElement) =>
  Array.from(lista.querySelectorAll('dd')).map((item) => item.textContent)

describe('as respostas de quem relatou', () => {
  it('cada resposta embaixo da sua pergunta, e a caixa livre no fim como "Mais detalhes"', () => {
    const respostas: ReportAnswerViewModel[] = [
      { Question: 'O que você tentou fazer?', Answer: 'Pagar com Pix' },
      { Question: 'O que aconteceu?', Answer: 'Nada acontece' },
      { Question: null, Answer: 'Usei o celular' },
    ]
    const { container } = render(<ReportAnswers answers={respostas} text={TEXTO} />)

    const lista = container.querySelector('dl') as HTMLElement
    expect(termos(lista)).toEqual(['O que você tentou fazer?', 'O que aconteceu?', 'Mais detalhes'])
    expect(definicoes(lista)).toEqual(['Pagar com Pix', 'Nada acontece', 'Usei o celular'])
    // A resposta mora junto da pergunta, e nao numa lista paralela.
    const pergunta = screen.getByText('O que aconteceu?')
    expect(pergunta.nextElementSibling?.textContent).toBe('Nada acontece')
  })

  it('com respostas, o texto juntado nao aparece de novo', () => {
    render(
      <ReportAnswers
        answers={[{ Question: 'O que aconteceu?', Answer: 'Nada acontece' }]}
        text="Nada acontece e o texto inteiro"
      />,
    )

    expect(screen.queryByText('Nada acontece e o texto inteiro')).toBeNull()
  })

  it('a resposta guarda as linhas como a pessoa escreveu', () => {
    const { container } = render(
      <ReportAnswers
        answers={[{ Question: 'O que aconteceu?', Answer: 'Primeira linha\nSegunda linha' }]}
        text=""
      />,
    )

    expect(container.querySelector('dd')?.textContent).toBe('Primeira linha\nSegunda linha')
  })

  it('so a caixa livre, sem pergunta nenhuma: o texto vai sem rotulo', () => {
    const { container } = render(
      <ReportAnswers answers={[{ Question: null, Answer: 'Um modo escuro' }]} text="ignorado" />,
    )

    expect(container.querySelector('dl')).toBeNull()
    expect(screen.queryByText('Mais detalhes')).toBeNull()
    expect(screen.getByText('Um modo escuro').tagName).toBe('P')
  })

  it('sem respostas, o texto como a pessoa escreveu, com as quebras de linha', () => {
    const { container } = render(<ReportAnswers answers={null} text={TEXTO} />)

    expect(container.querySelector('dl')).toBeNull()
    const paragrafo = container.querySelector('p')
    expect(paragrafo?.textContent).toBe(TEXTO)
  })

  it('a lista vazia vale como sem respostas', () => {
    const { container } = render(<ReportAnswers answers={[]} text="Um modo escuro" />)

    expect(container.querySelector('dl')).toBeNull()
    expect(container.querySelector('p')?.textContent).toBe('Um modo escuro')
  })
})
