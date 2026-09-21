// @vitest-environment jsdom
//
// Nao e teste de componente: e que `buildTrackingLink` sai de `environment`, que
// le `window.location` na carga do modulo — o mesmo motivo de `appearance.test.ts`.
// As asserticoes sao sobre a forma do endereco, e nao sobre a origem dele.

import { describe, expect, it } from 'vitest'
import { buildReporterCodeLink, buildTrackingLink, readTrackingLink } from '@/shared/lib/tracking'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **O token nao pode aparecer na query.** E a decisao de seguranca desta pagina:
 * o que vem depois do `#` nunca e enviado ao servidor, entao o token nao entra em
 * log de acesso nem no `Referer`. Mover o token para a query e uma mudanca de uma
 * linha que continua funcionando na tela — passa em qualquer teste de
 * comportamento, e desfaz o cuidado inteiro em silencio. Dai a asserticao ser
 * sobre a **forma** do endereco, e nao sobre o resultado.
 *
 * E a volta tem de ler o que a ida escreveu: o link e montado numa tela e lido em
 * outro documento, e nenhum teste de integracao cobre esse par.
 */

describe('o link de acompanhamento', () => {
  it('poe o protocolo na query e o token no fragmento, e nunca o contrario', () => {
    const link = buildTrackingLink('7K2M-9QXP-4TRV', 'tok-ABC_123')
    const [antes, fragmento] = link.split('#')

    expect(antes).toContain('c=7K2M-9QXP-4TRV')
    // A asserticao que importa: o segredo nao esta na parte que viaja.
    expect(antes).not.toContain('tok-ABC_123')
    expect(fragmento).toBe('t=tok-ABC_123')
  })

  it('escapa o que vai no endereco', () => {
    const link = buildTrackingLink('a b', 'to/ken+com=sinais')

    expect(link).not.toContain(' ')
    expect(link).toContain('to%2Fken%2Bcom%3Dsinais')
  })

  it('le de volta exatamente o que escreveu', () => {
    const link = buildTrackingLink('7K2M-9QXP-4TRV', 'tok-ABC_123')
    const [busca, fragmento] = link.split('#')

    expect(readTrackingLink(busca?.slice(busca.indexOf('?')) ?? '', `#${fragmento ?? ''}`)).toEqual(
      { code: '7K2M-9QXP-4TRV', token: 'tok-ABC_123', key: '', reporterCode: '' },
    )
  })

  it('link pela metade volta vazio, e nao pela metade', () => {
    // Cada um destes chega de verdade: o endereco copiado sem o fim, o link
    // colado num aplicativo que corta o fragmento, e a pagina aberta na mao.
    const vazio = { code: '', token: '', key: '', reporterCode: '' }

    expect(readTrackingLink('?c=7K2M', '')).toEqual({ ...vazio, code: '7K2M' })
    expect(readTrackingLink('', '#t=tok')).toEqual({ ...vazio, token: 'tok' })
    expect(readTrackingLink('', '')).toEqual(vazio)
  })

  it('aceita o fragmento com e sem o cerquilha na frente', () => {
    // `location.hash` vem com `#`; um teste ou uma chamada na mao, sem.
    expect(readTrackingLink('', '#t=tok').token).toBe('tok')
    expect(readTrackingLink('', 't=tok').token).toBe('tok')
  })

  it('o link da lista leva a chave na busca e o código no fragmento', () => {
    const link = buildReporterCodeLink('7K2M-9QXP-4TRV', 'pk_1R0KtQwz', 'H7QK-3M2X-P9WD')
    const [busca, fragmento] = link.split('#')

    // **O código não pode estar antes do `#`.** Ali ele entraria no log de acesso
    // do servidor e no `Referer` — e é ele que identifica a pessoa.
    expect(busca).not.toContain('H7QK')
    expect(fragmento).toContain('H7QK-3M2X-P9WD')

    // A chave pública pode ficar à vista: ela já é pública por definição.
    expect(busca).toContain('k=pk_1R0KtQwz')
  })

  it('o link da lista é lido de volta inteiro', () => {
    const link = buildReporterCodeLink('7K2M-9QXP-4TRV', 'pk_1R0KtQwz', 'H7QK-3M2X-P9WD')
    const [busca, fragmento] = link.split('#')

    expect(readTrackingLink(busca?.slice(busca.indexOf('?')) ?? '', `#${fragmento ?? ''}`)).toEqual(
      {
        code: '7K2M-9QXP-4TRV',
        token: '',
        key: 'pk_1R0KtQwz',
        reporterCode: 'H7QK-3M2X-P9WD',
      },
    )
  })
})
