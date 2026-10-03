import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from '@/shared/lib/markdown'

/**
 * O leitor da descricao do card. O que importa aqui: o que vira formatacao, o que
 * fica como texto — e que **nada vira HTML nem link perigoso**, porque nao ha
 * HTML neste caminho.
 */
describe('parseMarkdown', () => {
  it('paragrafos separados por linha em branco; quebra simples vira quebra', () => {
    expect(parseMarkdown('um\ndois\n\ntres')).toEqual([
      {
        kind: 'paragraph',
        children: [{ kind: 'text', text: 'um' }, { kind: 'break' }, { kind: 'text', text: 'dois' }],
      },
      { kind: 'paragraph', children: [{ kind: 'text', text: 'tres' }] },
    ])
  })

  it('titulo, lista, lista numerada, citacao e bloco de codigo', () => {
    const blocos = parseMarkdown(
      '# Titulo\n- um\n* dois\n\n3. tres\n4. quatro\n\n> citado\n\n```\nconst a = 1\n```',
    )
    expect(blocos.map((bloco) => bloco.kind)).toEqual(['heading', 'list', 'list', 'quote', 'code'])
    expect(blocos[1]).toMatchObject({
      ordered: false,
      items: [[{ text: 'um' }], [{ text: 'dois' }]],
    })
    expect(blocos[2]).toMatchObject({ ordered: true, start: 3 })
    expect(blocos[4]).toEqual({ kind: 'code', text: 'const a = 1' })
  })

  it('bloco de codigo sem cerca de fechar vai ate o fim, e nao some', () => {
    expect(parseMarkdown('```\nlinha 1\nlinha 2')).toEqual([
      { kind: 'code', text: 'linha 1\nlinha 2' },
    ])
  })

  it('o codigo dentro do bloco nao e lido como Markdown', () => {
    expect(parseMarkdown('```\n**nao negrito**\n```')).toEqual([
      { kind: 'code', text: '**nao negrito**' },
    ])
  })

  it('a cerca so abre sozinha na linha: ```npm ci``` e codigo no texto, e o resto continua', () => {
    expect(parseMarkdown('rode ```npm ci``` antes\n\noutro paragrafo')).toEqual([
      {
        kind: 'paragraph',
        children: [
          { kind: 'text', text: 'rode ' },
          { kind: 'code', text: 'npm ci' },
          { kind: 'text', text: ' antes' },
        ],
      },
      { kind: 'paragraph', children: [{ kind: 'text', text: 'outro paragrafo' }] },
    ])
    expect(parseMarkdown('```npm ci```\ndepois')).toEqual([
      {
        kind: 'paragraph',
        children: [
          { kind: 'code', text: 'npm ci' },
          { kind: 'break' },
          { kind: 'text', text: 'depois' },
        ],
      },
    ])
  })

  it('a cerca com a linguagem ao lado abre o bloco', () => {
    expect(parseMarkdown('```ts\nconst a = 1\n```\nfora')).toEqual([
      { kind: 'code', text: 'const a = 1' },
      { kind: 'paragraph', children: [{ kind: 'text', text: 'fora' }] },
    ])
  })
})

describe('parseInline', () => {
  it('negrito, italico e codigo', () => {
    expect(parseInline('a **b** _c_ *d* `e`')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'c' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'd' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'e' },
    ])
  })

  it('codigo com mais crases guarda a crase de dentro; sem fechamento, e texto', () => {
    expect(parseInline('use ``a `b` c`` aqui')).toEqual([
      { kind: 'text', text: 'use ' },
      { kind: 'code', text: 'a `b` c' },
      { kind: 'text', text: ' aqui' },
    ])
    expect(parseInline('`` `x` ``')).toEqual([{ kind: 'code', text: '`x`' }])
    expect(parseInline('``a` e b')).toEqual([{ kind: 'text', text: '``a` e b' }])
  })

  it('negrito e italico juntos, nas duas ordens, e italico no meio da palavra', () => {
    const negritoItalico = {
      kind: 'strong',
      children: [{ kind: 'em', children: [{ kind: 'text', text: 'isto' }] }],
    }
    expect(parseInline('***isto***')).toEqual([negritoItalico])
    expect(parseInline('**a *b***')).toEqual([
      {
        kind: 'strong',
        children: [
          { kind: 'text', text: 'a ' },
          { kind: 'em', children: [{ kind: 'text', text: 'b' }] },
        ],
      },
    ])
    expect(parseInline('*a **b***')).toEqual([
      {
        kind: 'em',
        children: [
          { kind: 'text', text: 'a ' },
          { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
        ],
      },
    ])
    expect(parseInline('pre*fixo*')).toEqual([
      { kind: 'text', text: 'pre' },
      { kind: 'em', children: [{ kind: 'text', text: 'fixo' }] },
    ])
    // O `__` de `__init__` e de outra marca, e fica como o texto que era.
    expect(parseInline('__init__')).toEqual([{ kind: 'text', text: '__init__' }])
  })

  it('marca que nao fecha fica como texto: 2 * 3 continua 2 * 3', () => {
    expect(parseInline('2 * 3 e **sem fim')).toEqual([{ kind: 'text', text: '2 * 3 e **sem fim' }])
  })

  it('sublinhado no meio da palavra e so sublinhado — na abertura e no fechamento', () => {
    expect(parseInline('nome_do_arquivo.ts')).toEqual([
      { kind: 'text', text: 'nome_do_arquivo.ts' },
    ])
    // Aqui o segundo `_` fecha na borda; o que segura e o primeiro, colado em "pre".
    expect(parseInline('pre_fixo_ solto')).toEqual([{ kind: 'text', text: 'pre_fixo_ solto' }])
  })

  it('barra invertida devolve a marca como texto', () => {
    expect(parseInline('\\*\\*nao\\*\\*')).toEqual([{ kind: 'text', text: '**nao**' }])
  })

  it('link com http, https e mailto; endereco solto sem a pontuacao do fim', () => {
    expect(parseInline('[site](https://exemplo.com) e veja http://a.com/x.')).toEqual([
      { kind: 'link', href: 'https://exemplo.com', children: [{ kind: 'text', text: 'site' }] },
      { kind: 'text', text: ' e veja ' },
      {
        kind: 'link',
        href: 'http://a.com/x',
        children: [{ kind: 'text', text: 'http://a.com/x' }],
      },
      { kind: 'text', text: '.' },
    ])
    expect(parseInline('[mande](mailto:time@exemplo.com)')[0]).toMatchObject({
      kind: 'link',
      href: 'mailto:time@exemplo.com',
    })
  })

  it('o rotulo do link nao tem link dentro: o endereco escrito nele e texto', () => {
    expect(parseInline('[veja https://a.com](https://b.com)')).toEqual([
      {
        kind: 'link',
        href: 'https://b.com',
        children: [{ kind: 'text', text: 'veja https://a.com' }],
      },
    ])
    expect(parseInline('[**ver** https://a.com](https://b.com)')[0]).toEqual({
      kind: 'link',
      href: 'https://b.com',
      children: [
        { kind: 'strong', children: [{ kind: 'text', text: 'ver' }] },
        { kind: 'text', text: ' https://a.com' },
      ],
    })
  })

  it('javascript:, data: e caminho relativo nao viram link: ficam como o texto que eram', () => {
    for (const perigoso of [
      '[clique](javascript:alert(1))',
      '[clique](JaVaScRiPt:alert(1))',
      '[clique](data:text/html,<script>alert(1)</script>)',
      '[clique](/admin)',
      '[clique](vbscript:msgbox)',
    ]) {
      const nos = parseInline(perigoso)
      expect(nos.some((no) => no.kind === 'link')).toBe(false)
      expect(nos.map((no) => (no.kind === 'text' ? no.text : '')).join('')).toBe(perigoso)
    }
  })

  it('HTML escrito e texto, e imagem nao carrega nada', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      { kind: 'text', text: '<script>alert(1)</script>' },
    ])
    // A imagem fica como texto, e o link de dentro dela vira link — nunca uma imagem
    // carregada sozinha no painel.
    const imagem = parseInline('![x](https://rastreador.exemplo/p.png)')
    expect(imagem[0]).toEqual({ kind: 'text', text: '!' })
    expect(imagem.some((no) => no.kind === 'link')).toBe(true)
  })
})
