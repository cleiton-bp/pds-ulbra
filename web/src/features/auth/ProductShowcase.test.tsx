// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INICIO, ProductShowcase, seguir } from '@/features/auth/ProductShowcase'

/**
 * A maquete da entrada e conduzida pelo visitante: cada passo espera o clique dele. Aqui o
 * caminho inteiro, pelos botoes (o arrasto e o mesmo movimento, pelo ponteiro).
 */

function coluna(id: string) {
  const elemento = document.querySelector<HTMLElement>(`[data-column-id="${id}"]`)
  if (!elemento) throw new Error(`sem a coluna ${id}`)
  return within(elemento)
}

function clicar(nome: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: nome }))
}

/** Deixa o tempo da maquete andar: enviar, o card chegando, a estrela escolhida. */
function passar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function etapaAtual() {
  return document.querySelector('li[aria-current="step"]')?.textContent ?? ''
}

describe('ProductShowcase', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('o que o visitante escreve vira o card do time e o titulo da pagina de quem relatou', () => {
    render(<ProductShowcase />)
    expect(screen.getByText(/Clique em Relatar/)).toBeTruthy()

    clicar('Relatar')
    const titulo = screen.getByLabelText('Em poucas palavras, o que aconteceu?')
    expect((titulo as HTMLInputElement).value).toBe('O botão de pagar não responde')

    fireEvent.change(titulo, { target: { value: 'O cupom some no carrinho' } })
    clicar('Enviar')
    passar(1300)

    expect(screen.getByText('H7QK-3M2X-P9WD')).toBeTruthy()
    expect(coluna('a-fazer').getByText('O cupom some no carrinho')).toBeTruthy()
    expect(screen.getByText(/Agora você é o time/)).toBeTruthy()

    clicar('Acompanhar este relato')
    expect(screen.getByRole('heading', { name: 'O cupom some no carrinho' })).toBeTruthy()
    expect(etapaAtual()).toContain('Recebido')
  })

  it('o time move o card e, do lado de fora, a etapa muda junto, ate quem relatou confirmar', () => {
    render(<ProductShowcase fim={<p>entrar agora</p>} />)
    clicar('Relatar')
    clicar('Enviar')
    passar(1300)

    clicar('Mover para Fazendo')
    expect(coluna('fazendo').getByText('O botão de pagar não responde')).toBeTruthy()
    expect(etapaAtual()).toContain('Em desenvolvimento')

    clicar('Mover para Feito')
    expect(etapaAtual()).toContain('Concluído')
    expect(screen.getByText('E para você, isso resolveu?')).toBeTruthy()
    expect(screen.queryByText('entrar agora')).toBeNull()

    clicar('Sim, resolveu')
    clicar('Nota 5')
    passar(400)
    expect(screen.getByText('Você confirmou que isso resolveu.')).toBeTruthy()
    expect(screen.getByText('Sua nota: 5 de 5.')).toBeTruthy()
    // Confirmado, o relato acabou: o card nao se move mais, e a entrada aparece embaixo.
    expect(screen.queryByRole('button', { name: /Mover para/ })).toBeNull()
    expect(screen.getByText('entrar agora')).toBeTruthy()
  })

  it('quem diz que nao resolveu reabre com o motivo, e o card volta para a primeira coluna', () => {
    render(<ProductShowcase />)
    clicar('Relatar')
    clicar('Enviar')
    passar(1300)
    clicar('Mover para Fazendo')
    clicar('Mover para Feito')

    clicar('Não, ainda não')
    expect(screen.getByLabelText('O que ainda está acontecendo?')).toBeTruthy()
    clicar('Reabrir o relato')

    expect(screen.getByText('Você reabriu este relato')).toBeTruthy()
    expect(coluna('a-fazer').getByText('O botão de pagar não responde')).toBeTruthy()
    expect(etapaAtual()).toContain('Recebido')
  })

  it('trocar o tipo troca o exemplo, ate o visitante escrever o dele', () => {
    render(<ProductShowcase />)
    clicar('Relatar')

    clicar('Dúvida')
    const titulo = screen.getByLabelText('Em poucas palavras, o que aconteceu?') as HTMLInputElement
    expect(titulo.value).toBe('Dá para parcelar a compra?')
    expect(screen.getByLabelText('Qual é a sua dúvida?')).toBeTruthy()

    fireEvent.change(titulo, { target: { value: 'Meu texto' } })
    clicar('Melhoria')
    expect(titulo.value).toBe('Meu texto')
  })

  it('sem titulo nao ha o que enviar', () => {
    render(<ProductShowcase />)
    clicar('Relatar')
    fireEvent.change(screen.getByLabelText('Em poucas palavras, o que aconteceu?'), {
      target: { value: '   ' },
    })
    expect((screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('o trilho leva ao comeco de qualquer passo, e Recomeçar volta ao site fechado', () => {
    render(<ProductShowcase />)
    const trilho = within(screen.getByRole('navigation', { name: 'Passos da simulação' }))

    fireEvent.click(trilho.getByRole('button', { name: 'Quem relatou confirma' }))
    expect(screen.getByText('E para você, isso resolveu?')).toBeTruthy()
    expect(
      trilho.getByRole('button', { name: 'Quem relatou confirma' }).getAttribute('aria-current'),
    ).toBe('step')

    clicar('Recomeçar')
    act(() => vi.runAllTimers())
    expect(screen.getByRole('button', { name: 'Relatar' })).toBeTruthy()
    expect(screen.getByText(/Clique em Relatar/)).toBeTruthy()
  })

  it('o botao de pagar do exemplo nao funciona, e a frase de cima aponta o Relatar', () => {
    render(<ProductShowcase />)
    clicar('Pagar com cartão')
    expect(screen.getByText('O botão não respondeu.')).toBeTruthy()
    expect(screen.getByText(/Use o Relatar, no canto da página/)).toBeTruthy()
  })

  it('a etapa de quem relatou nao volta quando o time recua o card, so quando ele reabre', () => {
    const enviado = seguir(INICIO, { faz: 'enviar' })
    const noFeito = seguir(seguir(enviado, { faz: 'mover', coluna: 1 }), {
      faz: 'mover',
      coluna: 2,
    })
    const recuado = seguir(noFeito, { faz: 'mover', coluna: 1 })

    // O card voltou para Fazendo, mas a pagina de quem espera continua em Concluido.
    expect(recuado.coluna).toBe(1)
    expect(recuado.etapaPublica).toBe(2)

    // Quem relatou diz que nao resolveu: ai a jornada dele volta ao comeco.
    const reaberto = seguir(seguir(noFeito, { faz: 'responder', resolveu: false }), {
      faz: 'reabrir',
    })
    expect(reaberto.coluna).toBe(0)
    expect(reaberto.etapaPublica).toBe(0)
  })

  it('a resposta e uma caixa de varias linhas, com o limite do quadro de verdade', () => {
    render(<ProductShowcase />)
    clicar('Relatar')
    const resposta = screen.getByLabelText('O que você tentou fazer?')

    expect(resposta.tagName).toBe('TEXTAREA')
    expect(resposta.getAttribute('maxlength')).toBe('1000')
    fireEvent.change(resposta, { target: { value: 'No checkout.\nDepois de escolher o cartão.' } })
    expect((resposta as HTMLTextAreaElement).value).toContain('\n')
  })
})
