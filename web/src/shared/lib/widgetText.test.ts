// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { firstName, renderWidgetText } from '@/shared/lib/widgetText'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O valor, o padrao escrito, o de fabrica — nessa ordem.** E a confirmacao de um
 * relato que ja chegou: variavel desconhecida ou sem valor nunca derruba a tela nem
 * escreve "undefined".
 *
 * **O resultado e texto.** O valor e o que a pessoa digitou no nome; posto na tela pelo
 * React, `<script>` aparece escrito, e nenhum elemento nasce dele.
 */
afterEach(cleanup)

describe('renderWidgetText', () => {
  it('troca cada variavel pelo valor', () => {
    expect(
      renderWidgetText(
        'Obrigado, {{primeiroNome}}! Protocolo {{protocolo}} ({{tipo}}) em {{projeto}}.',
        {
          primeiroNome: 'Ana',
          protocolo: 'PDS-42',
          tipo: 'erro',
          projeto: 'Loja',
        },
      ),
    ).toBe('Obrigado, Ana! Protocolo PDS-42 (erro) em Loja.')
  })

  it('tolera espacos em volta do nome e apara o valor', () => {
    expect(renderWidgetText('Oi, {{ primeiroNome }}.', { primeiroNome: '  Ana  ' })).toBe(
      'Oi, Ana.',
    )
  })

  it('a mesma variavel repetida e trocada em todos os lugares', () => {
    expect(renderWidgetText('{{protocolo}} / {{protocolo}}', { protocolo: 'P-1' })).toBe(
      'P-1 / P-1',
    )
  })

  it('sem valor, usa o padrao escrito no texto, aparado', () => {
    const texto = 'Obrigado, {{primeiroNome| amigo }}!'
    expect(renderWidgetText(texto, {})).toBe('Obrigado, amigo!')
    expect(renderWidgetText(texto, { primeiroNome: null })).toBe('Obrigado, amigo!')
    expect(renderWidgetText(texto, { primeiroNome: undefined })).toBe('Obrigado, amigo!')
    expect(renderWidgetText(texto, { primeiroNome: '   ' })).toBe('Obrigado, amigo!')
  })

  it('o valor vence o padrao escrito', () => {
    expect(renderWidgetText('Oi, {{primeiroNome|amigo}}', { primeiroNome: 'Ana' })).toBe('Oi, Ana')
  })

  it('padrao escrito vazio vale: apaga a variavel em vez de cair no de fabrica', () => {
    expect(renderWidgetText('Oi{{primeiroNome|}}!', {})).toBe('Oi!')
  })

  it('sem valor e sem padrao escrito, usa o de fabrica', () => {
    expect(renderWidgetText('Obrigado, {{primeiroNome}}', {})).toBe('Obrigado, você')
    expect(renderWidgetText('Seu {{tipo}} chegou', { tipo: '' })).toBe('Seu relato chegou')
  })

  it('o de fabrica vazio nunca escreve "undefined"', () => {
    const texto = renderWidgetText('[{{protocolo}}][{{projeto}}]', {})
    expect(texto).toBe('[][]')
    expect(texto).not.toContain('undefined')
  })

  it('variavel desconhecida nao derruba: vira o padrao escrito ou nada', () => {
    expect(() => renderWidgetText('Em {{cidade}}.', {})).not.toThrow()
    expect(renderWidgetText('Em {{cidade}}.', {})).toBe('Em .')
    expect(renderWidgetText('Em {{cidade|Porto Alegre}}.', {})).toBe('Em Porto Alegre.')
  })

  it('nome de propriedade do proprio objeto nao vira valor', () => {
    const texto = renderWidgetText('[{{constructor}}][{{toString}}][{{__proto__}}]', {})
    expect(texto).toBe('[][][]')
  })

  it('chaves soltas e texto sem variavel passam intactos', () => {
    const texto = 'Sem {variavel} aqui, nem {{ isso'
    expect(renderWidgetText(texto, { primeiroNome: 'Ana' })).toBe(texto)
  })

  it('o valor entra literal: nem `$&` nem uma variavel dentro dele sao reinterpretados', () => {
    expect(
      renderWidgetText('Oi, {{primeiroNome}}', {
        primeiroNome: '$& {{protocolo}}',
        protocolo: 'X',
      }),
    ).toBe('Oi, $& {{protocolo}}')
  })
})

describe('o valor com HTML', () => {
  it('<script> no nome aparece como texto, e nenhum elemento e criado', () => {
    const nome = '<script>window.__pdsInjetado = true</script><b>Ana</b>'
    const texto = renderWidgetText('Obrigado, {{primeiroNome}}!', { primeiroNome: nome })
    expect(texto).toBe(`Obrigado, ${nome}!`)

    const { container } = render(createElement('p', null, texto))

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText(`Obrigado, ${nome}!`)).toBeTruthy()
    expect((window as unknown as Record<string, unknown>).__pdsInjetado).toBeUndefined()
  })
})

describe('firstName', () => {
  it('fica com a primeira palavra do nome', () => {
    expect(firstName('Ana Paula Souza')).toBe('Ana')
    expect(firstName('  Bruno\tLima ')).toBe('Bruno')
  })

  it('sem nome, devolve nulo', () => {
    expect(firstName(null)).toBeNull()
    expect(firstName(undefined)).toBeNull()
    expect(firstName('   ')).toBeNull()
  })
})
