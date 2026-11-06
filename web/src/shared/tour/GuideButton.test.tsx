// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuideButton } from '@/shared/tour/GuideButton'
import {
  type GuideStep,
  guideTarget,
  useGuideStore,
  useScreenGuide,
} from '@/shared/tour/guideStore'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O botao so existe com roteiro**, e na primeira visita um balao aponta para ele, uma
 * vez so. **O guia anda, conta e sai** (Proximo, Voltar, Esc), e o passo cujo alvo nao
 * esta na tela e pulado, sem deixar a contagem mentir para o resto.
 *
 * **O guia diz de qual tela e**: o botao, o balao e o cartao levam o nome da tela, e um
 * ponto marca a tela cujo guia ainda nao foi aberto, uma tela de cada vez.
 */

const PASSOS: GuideStep[] = [
  { alvo: 'um', titulo: 'Primeiro', texto: 'A primeira parte da tela.' },
  { alvo: 'sumido', titulo: 'Fora da tela', texto: 'Esta parte nao aparece.' },
  { alvo: 'dois', titulo: 'Segundo', texto: 'A segunda parte da tela.' },
]

function Tela({ passos = PASSOS, id = 'teste' }: { passos?: GuideStep[] | null; id?: string }) {
  useScreenGuide(id, passos)
  return (
    <div>
      <GuideButton />
      <p {...guideTarget('um')}>parte um</p>
      <p {...guideTarget('dois')}>parte dois</p>
    </div>
  )
}

// O jsdom nao tem layout: as partes marcadas ganham uma caixa, menos a "sumida".
const caixaOriginal = Element.prototype.getBoundingClientRect

beforeEach(() => {
  localStorage.clear()
  useGuideStore.setState({ pilha: [], tela: null, aberto: false })
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const nome = this.getAttribute('data-guia')
    if (!nome || nome === 'sumido') return caixaOriginal.call(this)
    return {
      left: 10,
      top: 100,
      width: 120,
      height: 30,
      right: 130,
      bottom: 130,
      x: 10,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect
  }
})

afterEach(() => {
  cleanup()
  Element.prototype.getBoundingClientRect = caixaOriginal
  vi.useRealTimers()
})

describe('GuideButton', () => {
  it('sem roteiro, nao ha botao', () => {
    render(<Tela passos={null} />)
    expect(screen.queryByRole('button', { name: 'Guia da tela' })).toBeNull()
  })

  it('na primeira vez, o balao aponta para o guia, e nao volta depois de respondido', async () => {
    const { unmount } = render(<Tela />)
    expect(
      await screen.findByText(/cada tela do painel tem o seu/, {}, { timeout: 2000 }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(screen.queryByText(/cada tela do painel tem o seu/)).toBeNull()
    unmount()

    // Outra visita, qualquer tela: o guia ja foi apresentado, so o botao.
    vi.useFakeTimers()
    render(<Tela />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('button', { name: 'Guia da tela' })).toBeTruthy()
    expect(screen.queryByText(/cada tela do painel tem o seu/)).toBeNull()
  })

  it('o guia anda, pula o que nao esta na tela, conta certo e sai pelo Esc', async () => {
    render(<Tela />)
    fireEvent.click(screen.getByRole('button', { name: 'Guia da tela' }))

    expect(await screen.findByRole('heading', { name: 'Primeiro' })).toBeTruthy()
    expect(screen.getByText('Passo 1 de 2')).toBeTruthy()

    // O passo que aponta para o que nao aparece saiu antes de abrir: a conta nao mente.
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(await screen.findByRole('heading', { name: 'Segundo' }, { timeout: 2000 })).toBeTruthy()
    expect(screen.getByText('Passo 2 de 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(useGuideStore.getState().aberto).toBe(false))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('abrir o guia pelo balao conta como apresentado', async () => {
    render(<Tela />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ver o guia' }, { timeout: 2000 }))

    expect(await screen.findByRole('heading', { name: 'Primeiro' })).toBeTruthy()
    expect(localStorage.getItem('pds.web.guia-apresentado.v1')).toBe('1')
  })

  it('o botao, o balao e o cartao dizem de qual tela e o guia', async () => {
    render(<Tela id="trabalho" />)
    const botao = screen.getByRole('button', { name: 'Guia do Trabalho' })
    expect(
      await screen.findByText(
        'Este é o guia do Trabalho, e cada tela do painel tem o seu, sempre neste botão.',
        {},
        { timeout: 2000 },
      ),
    ).toBeTruthy()

    fireEvent.click(botao)
    const cartao = await screen.findByRole('dialog', { name: 'Primeiro' })
    expect(within(cartao).getByText('Guia do Trabalho')).toBeTruthy()
    expect(within(cartao).getByText('Passo 1 de 2')).toBeTruthy()
  })

  it('tela sem nome registrado fica com "Guia da tela"', () => {
    render(<Tela id="tela-nova" />)
    expect(screen.getByRole('button', { name: 'Guia da tela' })).toBeTruthy()
  })

  it('o ponto marca o guia ainda nao aberto, uma tela de cada vez', async () => {
    // Ja apresentado: so o ponto, sem o balao.
    localStorage.setItem('pds.web.guia-apresentado.v1', '1')
    const primeira = render(<Tela id="trabalho" />)
    const botao = screen.getByRole('button', { name: 'Guia do Trabalho' })
    await waitFor(() => expect(botao.hasAttribute('data-novo')).toBe(true))

    fireEvent.click(botao)
    expect(await screen.findByRole('heading', { name: 'Primeiro' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(botao.hasAttribute('data-novo')).toBe(false)
    primeira.unmount()

    // Outra tela: o guia dela ainda nao foi aberto, e o ponto aparece la.
    const segunda = render(<Tela id="moderacao" />)
    const daModeracao = screen.getByRole('button', { name: 'Guia da Moderação' })
    await waitFor(() => expect(daModeracao.hasAttribute('data-novo')).toBe(true))
    segunda.unmount()

    // De volta ao Trabalho: ja aberto, sem ponto.
    render(<Tela id="trabalho" />)
    expect(screen.getByRole('button', { name: 'Guia do Trabalho' }).hasAttribute('data-novo')).toBe(
      false,
    )
  })
})
