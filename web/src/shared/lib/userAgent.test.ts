import { describe, expect, it } from 'vitest'
import { resumirNavegador } from '@/shared/lib/userAgent'

/**
 * O QUE ESTES TESTES TRAVAM: o navegador aparece como o time le ("Chrome 142 no macOS").
 * O Edge e o Opera tambem dizem "Chrome", e o Chrome tambem diz "Safari": a ordem importa.
 */
describe('o navegador resumido', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'Chrome 142 no macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      'Safari 18.1 no iOS 18',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70',
      'Edge 131 no Windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
      'Firefox 133 no Linux',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      'Samsung Internet 26 no Android 14',
    ],
  ])('%s', (linha, esperado) => {
    expect(resumirNavegador(linha)).toBe(esperado)
  })

  it('o que nao reconhece volta como veio', () => {
    expect(resumirNavegador('robo-de-teste/1.0')).toBe('robo-de-teste/1.0')
  })
})
