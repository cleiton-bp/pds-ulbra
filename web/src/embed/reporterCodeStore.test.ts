// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readReporterCode, writeReporterCode } from '@/embed/reporterCodeStore'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O armazenamento falha em condicoes normais**, e nao so em teste: janela
 * anonima, dados do site bloqueados, cota cheia. Se qualquer uma dessas derrubar
 * a ferramenta, o relato deixa de ser enviado por causa de uma conveniencia — que
 * e o oposto da ordem de importancia.
 *
 * **O codigo e por projeto.** Um valor unico faria o codigo de um site ser mandado
 * a outro, que responderia vazio e trocaria o codigo da pessoa por um novo.
 */
describe('o codigo pessoal no navegador', () => {
  const real = window.localStorage

  beforeEach(() => window.localStorage.clear())

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', { value: real, configurable: true })
    vi.restoreAllMocks()
  })

  it('guarda e le de volta', () => {
    writeReporterCode('pk_um', 'H7QK-3M2X-P9WD')
    expect(readReporterCode('pk_um')).toBe('H7QK-3M2X-P9WD')
  })

  it('nao mistura projetos', () => {
    writeReporterCode('pk_um', 'AAAA-BBBB-CCCC')
    writeReporterCode('pk_dois', 'DDDD-EEEE-FFFF')

    expect(readReporterCode('pk_um')).toBe('AAAA-BBBB-CCCC')
    expect(readReporterCode('pk_dois')).toBe('DDDD-EEEE-FFFF')
  })

  it('nulo apaga o que estava guardado', () => {
    writeReporterCode('pk_um', 'AAAA-BBBB-CCCC')
    writeReporterCode('pk_um', null)

    expect(readReporterCode('pk_um')).toBeNull()
  })

  it('valor em branco conta como ausente', () => {
    window.localStorage.setItem('pds.reporter-code.pk_um', '   ')
    expect(readReporterCode('pk_um')).toBeNull()
  })

  it('ler nao estoura quando o armazenamento lanca', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('bloqueado')
        },
      },
      configurable: true,
    })

    expect(readReporterCode('pk_um')).toBeNull()
  })

  it('gravar nao estoura quando o armazenamento lanca', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        setItem: () => {
          throw new Error('cota cheia')
        },
      },
      configurable: true,
    })

    expect(() => writeReporterCode('pk_um', 'AAAA-BBBB-CCCC')).not.toThrow()
  })
})
