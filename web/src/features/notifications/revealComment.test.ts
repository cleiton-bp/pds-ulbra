// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commentAnchorId, revealComment } from '@/features/notifications/revealComment'

/**
 * O QUE ESTES TESTES TRAVAM: abrir a mencao leva ate o comentario (S-08).
 *
 * - **Espera o comentario aparecer**: o card abre e le os comentarios depois.
 * - **Rola ate ele, poe o foco nele e o acende** por dois segundos — num card longo, a
 *   mencao ficava abaixo da dobra.
 * - **Desiste sozinho** depois de alguns segundos (o comentario saiu, a pessoa foi para
 *   outro card), e quem chamou pode desistir antes.
 * - **O endereco e o que o card aberto poe em cada comentario** (`comentario-<id>`, no
 *   `ReportComments`): mudar um sem o outro faria o sino abrir o card e nao achar nada.
 */
describe('levar ate o comentario da mencao', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  /** O comentario como o card aberto o desenha: com o endereco, e com foco por programa. */
  function comentario(id: string, focavel = true) {
    const no = document.createElement('div')
    no.id = commentAnchorId(id)
    if (focavel) no.tabIndex = -1
    const rolar = vi.fn()
    const acender = vi.fn()
    Object.assign(no, { scrollIntoView: rolar, animate: acender })
    document.body.append(no)
    return { no, rolar, acender }
  }

  it('o endereco e o que o card aberto poe em cada comentario', () => {
    expect(commentAnchorId('k-1')).toBe('comentario-k-1')
  })

  it('espera o comentario aparecer, rola ate ele, poe o foco e o acende por dois segundos', () => {
    revealComment('k-1')
    // O card ainda le os comentarios: nada na tela por um segundo.
    vi.advanceTimersByTime(1_000)
    const { no, rolar, acender } = comentario('k-1')
    vi.advanceTimersByTime(150)

    expect(rolar).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(document.activeElement).toBe(no)
    expect(acender).toHaveBeenCalledWith(expect.any(Array), {
      duration: 2_000,
      easing: 'ease-out',
    })
    // Achado, para de procurar.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sem aparecer em dez segundos, desiste — e quem chamou pode desistir antes', () => {
    revealComment('k-2')
    vi.advanceTimersByTime(10_200)
    expect(vi.getTimerCount()).toBe(0)
    const tarde = comentario('k-2')
    vi.advanceTimersByTime(1_000)
    expect(tarde.rolar).not.toHaveBeenCalled()

    // A pessoa foi para outro card: o sino desiste, e o comentario que aparece depois fica quieto.
    const desistir = revealComment('k-3')
    vi.advanceTimersByTime(300)
    desistir()
    const outro = comentario('k-3')
    vi.advanceTimersByTime(1_000)
    expect(outro.rolar).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(outro.no)
  })

  it('o que nao recebe foco e so rolado e aceso', () => {
    const { no, rolar, acender } = comentario('k-4', false)
    revealComment('k-4')
    vi.advanceTimersByTime(150)
    expect(rolar).toHaveBeenCalled()
    expect(acender).toHaveBeenCalled()
    expect(document.activeElement).not.toBe(no)
  })
})
