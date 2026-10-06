// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { focusAnyway } from '@/shared/lib/focus'

/**
 * O QUE ESTE TESTE TRAVA: o elemento que nao recebe foco por si o recebe **so desta
 * vez** — o `tabindex` sai quando o foco vai embora. Fixo, o clique do mouse num canto
 * vazio levaria o foco para ele.
 */
describe('o foco de reserva', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('a coluna recebe o foco, e deixa de ser focavel quando ele sai', () => {
    document.body.innerHTML = '<section id="coluna"><p>vazia</p></section><button>outro</button>'
    const coluna = document.getElementById('coluna') as HTMLElement

    focusAnyway(coluna)
    expect(document.activeElement).toBe(coluna)

    document.querySelector('button')?.focus()
    expect(coluna.hasAttribute('tabindex')).toBe(false)
  })

  it('o que ja e focavel so recebe o foco, sem tabindex a mais', () => {
    document.body.innerHTML = '<a href="/x">card</a>'
    const link = document.querySelector('a') as HTMLElement

    focusAnyway(link)
    expect(document.activeElement).toBe(link)
    expect(link.hasAttribute('tabindex')).toBe(false)
  })
})
