// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { readProductAccent } from '@/features/widgetSettings/productAccent'

/**
 * Este arquivo escreve cor crua de proposito, e pode: `designSystem.test.ts` nao
 * varre `.test.ts`. E o unico jeito de exercitar uma funcao cuja razao de existir
 * e nao escrever cor crua em lugar nenhum.
 */
function declarar(token: string, value: string) {
  document.documentElement.style.setProperty(token, value)
}

afterEach(() => {
  document.documentElement.style.removeProperty('--accent')
  document.documentElement.style.removeProperty('--ink-on-light')
})

describe('a cor de acento do produto', () => {
  it('vem da folha de estilo, e nao do codigo', () => {
    declarar('--accent', '#1c2024')

    expect(readProductAccent()).toBe('#1c2024')
  })

  it('a forma curta e expandida — o seletor de cor ignora a de tres digitos', () => {
    declarar('--accent', '#ABC')

    expect(readProductAccent()).toBe('#aabbcc')
  })

  it('sem acento legivel, cai na tinta; sem nenhuma das duas, devolve nulo', () => {
    declarar('--accent', 'var(--slate-12)')
    declarar('--ink-on-light', '#1c2024')
    expect(readProductAccent()).toBe('#1c2024')

    document.documentElement.style.removeProperty('--ink-on-light')
    expect(readProductAccent()).toBeNull()
  })
})
