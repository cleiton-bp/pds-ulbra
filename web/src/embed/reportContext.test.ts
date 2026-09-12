// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import type { EmbedConfig } from '@/embed/config'
import { buildReportContext } from '@/embed/reportContext'

/**
 * O teste que importa aqui e o de **ausencia**: chave sem valor nao pode ir junto.
 * Um par `viewport: ""` no banco nao e um dado a menos — e um dado errado, que
 * quem for ler depois vai tentar interpretar.
 */
const config: EmbedConfig = {
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
  viewport: '1280x800',
}

/** O jsdom sempre tem um user agent; o teste precisa conseguir tira-lo. */
function fingirNavegador(userAgent: string, language: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true })
  Object.defineProperty(window.navigator, 'language', { value: language, configurable: true })
}

const ORIGINAL_USER_AGENT = navigator.userAgent
const ORIGINAL_LANGUAGE = navigator.language

describe('o contexto que vai junto com o relato', () => {
  afterEach(() => fingirNavegador(ORIGINAL_USER_AGENT, ORIGINAL_LANGUAGE))

  it('leva navegador, idioma e tamanho da janela da pagina', () => {
    fingirNavegador('Mozilla/5.0 Firefox/142.0', 'pt-BR')

    expect(buildReportContext(config)).toEqual({
      user_agent: 'Mozilla/5.0 Firefox/142.0',
      language: 'pt-BR',
      viewport: '1280x800',
    })
  })

  it('sem a janela da pagina, a chave nao vai em branco — ela nao vai', () => {
    fingirNavegador('Mozilla/5.0 Firefox/142.0', 'pt-BR')

    expect(buildReportContext({ ...config, viewport: null })).toEqual({
      user_agent: 'Mozilla/5.0 Firefox/142.0',
      language: 'pt-BR',
    })
  })

  it('sem nada para contar, manda nulo em vez de um objeto vazio', () => {
    fingirNavegador('', '')

    expect(buildReportContext({ ...config, viewport: null })).toBeNull()
  })
})
