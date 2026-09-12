import { describe, expect, it } from 'vitest'
import {
  configFromInit,
  configFromLocation,
  sanitizeRoute,
  shouldWaitForHost,
} from '@/embed/config'
import { MESSAGE_SOURCE } from '@/embed/protocol'

/**
 * A rota e o unico campo do relato que costuma carregar dado de quem esta
 * relatando: `?token=`, `?cpf=`, `?email=` sao comuns em barra de endereco. A API
 * tambem corta, e cortar **aqui** significa que isso nao chega a sair da maquina.
 *
 * Dois cortes para o mesmo dado nao e desperdicio: sao fronteiras diferentes.
 */
describe('o corte da rota', () => {
  it('descarta o que vem depois da interrogacao', () => {
    expect(sanitizeRoute('/checkout?token=SEGREDO&cpf=00011122233')).toBe('/checkout')
  })

  it('descarta o que vem depois da cerquilha', () => {
    expect(sanitizeRoute('/conta#dados-pessoais')).toBe('/conta')
  })

  it('descarta os dois na ordem em que aparecerem', () => {
    expect(sanitizeRoute('/checkout?token=X#topo')).toBe('/checkout')
    expect(sanitizeRoute('/checkout#topo?token=X')).toBe('/checkout')
  })

  it('rota vazia ou so query vira nulo, e nao string vazia', () => {
    expect(sanitizeRoute('')).toBeNull()
    expect(sanitizeRoute(null)).toBeNull()
    expect(sanitizeRoute('?token=X')).toBeNull()
    expect(sanitizeRoute('   ')).toBeNull()
  })

  it('corta em 400 para nao mandar uma pagina inteira no campo de rota', () => {
    expect(sanitizeRoute(`/${'a'.repeat(900)}`)).toHaveLength(400)
  })
})

describe('de onde o quadro tira a configuracao', () => {
  it('da barra de endereco, quando aberto direto', () => {
    expect(configFromLocation('?k=pk_DEMO&route=/checkout%3Ftoken%3DX&origin=loja.com')).toEqual({
      key: 'pk_DEMO',
      route: '/checkout',
      origin: 'loja.com',
    })
  })

  it('sem chave na barra, a chave fica vazia em vez de undefined', () => {
    expect(configFromLocation('').key).toBe('')
  })

  it('do init, quando esta dentro de uma pagina — e corta a rota de novo', () => {
    expect(
      configFromInit({
        source: MESSAGE_SOURCE,
        type: 'init',
        key: '  pk_DEMO  ',
        // A pagina ja manda cortado; quem confere dado de fora e quem recebe.
        route: '/checkout?token=SEGREDO',
        origin: 'loja.exemplo.com',
      }),
    ).toEqual({ key: 'pk_DEMO', route: '/checkout', origin: 'loja.exemplo.com' })
  })
})

/**
 * Esta regra existe por causa de um defeito que passou por typecheck, lint, 87
 * testes e build sem uma reclamacao, e so apareceu numa captura de tela: o
 * painel embute o quadro num `iframe` **sem carregador**, para o relato de
 * teste. Como havia pagina hospedeira, o quadro esperava um `init` que ninguem
 * ia mandar — e o modal abria com um retangulo vazio.
 */
describe('esperar o init, ou desenhar com o que esta na barra', () => {
  it('dentro de uma pagina e sem chave na barra: espera o init do carregador', () => {
    expect(shouldWaitForHost('', true)).toBe(true)
    expect(shouldWaitForHost('?route=/checkout', true)).toBe(true)
  })

  it('dentro de uma pagina mas COM chave na barra: desenha na hora', () => {
    // O caso do relato de teste no painel. Sem isto, retangulo vazio.
    expect(shouldWaitForHost('?k=pk_DEMO', true)).toBe(false)
  })

  it('fora de uma pagina: nunca espera, tenha chave ou nao', () => {
    expect(shouldWaitForHost('?k=pk_DEMO', false)).toBe(false)
    expect(shouldWaitForHost('', false)).toBe(false)
  })

  it('chave so de espaco nao conta como chave', () => {
    expect(shouldWaitForHost('?k=%20%20', true)).toBe(true)
  })
})
