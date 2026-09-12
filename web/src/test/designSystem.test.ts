import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Button, type ButtonVariant } from '@/shared/components/Button'
import { cn, colorNames, fontSizeNames } from '@/shared/lib/cn'

/**
 * O SISTEMA DE COR, CONFERIDO POR TESTE
 * ============================================================================
 *
 *     primitivo  →  significado  →  @theme inline  →  utilitario  →  componente
 *     --slate-6     --border        --color-border    border-border
 *
 * `tokens.css` manda que primitivo nunca saia dele, mas comentario nao reprova
 * ninguem: quando este arquivo foi escrito a regra ja estava quebrada em quatro
 * pontos. Nenhum deles era descuido de revisao — `#fff` e `bg-black/45` sao codigo
 * valido, bonito e que funciona. So teste pega isso.
 *
 * Espacamento e raio arbitrarios (`w-[29px]`) seguem liberados: nao tem camada de
 * significado, entao nao ha substituto para exigir.
 */

const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Os unicos que podem escrever cor crua: a camada 1 e quem a republica. */
const COLOR_AUTHORITY = ['styles/tokens.css', 'styles/index.css']

/**
 * O carregador e a segunda excecao do projeto, pelo mesmo motivo do favicon: ele
 * **nao roda no nosso documento**. Ele manipula o DOM da pagina do cliente, onde
 * `var(--surface)` nao existe e nunca vai existir — nosso CSS esta dentro do
 * `iframe`, do outro lado da fronteira de origem.
 *
 * Como no favicon, a excecao e **conferida e nao isenta**: a auditoria logo
 * abaixo diz exatamente que cor ele pode escrever, e reprova qualquer outra.
 */
const FORA_DO_DOCUMENTO = ['loader/main.ts']

/** As 22 famílias da paleta padrao do Tailwind, que este produto nao usa. */
const TAILWIND_PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

const FORBIDDEN: Array<{ label: string; pattern: RegExp; instead: string }> = [
  {
    label: 'cor em hexadecimal',
    pattern: /#[0-9a-fA-F]{3,8}\b/g,
    instead: 'use o token de significado (`text-active-fg`, `bg-surface`) ou `currentColor`',
  },
  {
    label: 'cor em rgb()/rgba()/hsl()',
    pattern: /\b(?:rgba?|hsla?)\(/g,
    instead: 'declare o valor em `tokens.css` e publique como utilitario',
  },
  {
    label: 'paleta padrao do Tailwind',
    pattern: new RegExp(
      `\\b(?:bg|text|border|ring|fill|stroke|from|via|to|divide|outline|shadow|accent|caret|decoration|placeholder)-(?:${TAILWIND_PALETTE})-\\d{2,3}\\b`,
      'g',
    ),
    instead: 'a paleta do produto e a camada 2 de `tokens.css`, e nao a do Tailwind',
  },
  {
    label: 'preto ou branco direto',
    pattern:
      /\b(?:bg|text|border|ring|fill|stroke|divide|outline)-(?:black|white)(?:\/\d{1,3})?\b/g,
    instead: 'preto e branco tambem sao decisao de tema: veja `--overlay` e `--accent-fg`',
  },
  {
    label: 'cor escrita em atributo de estilo',
    pattern: /style=\{\{[^}]*(?:color|background|fill|stroke)/g,
    instead: 'estilo embutido escapa do tema: o valor nao muda no escuro',
  },
  {
    label: 'tamanho de fonte em pixel',
    pattern: /\btext-\[\d+px\](?![\w-])/g,
    instead: 'use o nome do papel: `text-detail`, `text-body`, `text-lead`, `text-screen`',
  },
  {
    label: 'z-index em numero',
    // `z-50` **funciona**, e por isso e perigoso: a classe existe, o elemento sobe
    // e a ordem de `index.css` deixa de valer sem nada quebrar.
    pattern: /\bz-\d+\b/g,
    instead: 'use a camada nomeada: `z-drawer`, `z-veil`, `z-dialog`, `z-toast`, `z-tip`',
  },
  {
    label: 'a escala de fonte do Tailwind',
    // `--text-*: initial` apagou essas classes: `text-sm` nao gera CSS e o texto
    // encolhe para o tamanho herdado, sem erro nenhum.
    pattern: /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g,
    instead: 'a escala do produto e a de `index.css`; `text-sm` nao gera classe nenhuma',
  },
]

function listFiles(directory: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)

    if (statSync(path).isDirectory()) {
      files.push(...listFiles(path))
      continue
    }

    // Teste nao e interface: este arquivo precisa escrever os padroes que procura.
    if (/\.(tsx?|css)$/.test(entry) && !entry.endsWith('.test.ts')) files.push(path)
  }

  return files
}

describe('valores de cor fora do sistema de tokens', () => {
  for (const rule of FORBIDDEN) {
    it(`nenhum arquivo escreve ${rule.label} — ${rule.instead}`, () => {
      const violations: string[] = []

      for (const file of listFiles(SOURCE_ROOT)) {
        const relativePath = relative(SOURCE_ROOT, file)
        if (COLOR_AUTHORITY.includes(relativePath)) continue
        if (FORA_DO_DOCUMENTO.includes(relativePath)) continue

        const lines = readFileSync(file, 'utf8').split('\n')

        lines.forEach((line, index) => {
          // Regex global sobrevive entre chamadas: sem zerar, `lastIndex` pula ocorrencia.
          rule.pattern.lastIndex = 0
          const found = line.match(rule.pattern)
          if (found) violations.push(`${relativePath}:${index + 1} — ${found.join(', ')}`)
        })
      }

      expect(violations).toEqual([])
    })
  }

  /**
   * Token sem consumidor nao e sobra inofensiva: quem precisa da cor nao acha o
   * token e escreve o valor cru ao lado.
   */
  const ESCALAS_PUBLICADAS = [
    { rotulo: 'cor', padrao: /--color-([a-z-]+):/g, prefixo: '-' },
    { rotulo: 'tamanho de texto', padrao: /--text-([a-z-]+):(?!\s*initial)/g, prefixo: 'text-' },
    { rotulo: 'camada', padrao: /@utility (z-[a-z-]+)/g, prefixo: '' },
  ]

  for (const escala of ESCALAS_PUBLICADAS) {
    it(`todo token de ${escala.rotulo} tem pelo menos um consumidor`, () => {
      const css = readFileSync(join(SOURCE_ROOT, 'styles/index.css'), 'utf8')
      const published = [...css.matchAll(escala.padrao)]
        .map((match) => match[1] ?? '')
        // `--text-body--line-height` acompanha `--text-body`; nao e token proprio.
        .filter((token) => !token.endsWith('--line-height'))

      const sources = listFiles(SOURCE_ROOT)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n')

      const orphans = published.filter(
        (token) => !new RegExp(`\\b${escala.prefixo}${token}\\b(?!-)`).test(sources),
      )

      expect(orphans).toEqual([])
    })
  }
})

/**
 * CONTRASTE — a auditoria virando guarda
 * ============================================================================
 * Os numeros foram medidos um por um, nos dois temas. Nao provam que o painel e
 * acessivel: impedem que uma edicao futura piore o que ja foi medido.
 *
 * DOIS PARES FICAM ABAIXO DE 4,5:1, com o numero a vista. `warn-fg` sobre
 * `warn-surface` da 4,25 — e o par que o proprio Radix recomenda, e corrigir faria
 * a tela divergir da prancheta. `fg-placeholder` da 3,60, pelo motivo escrito em
 * `tokens.css`.
 *
 * Os pontos de status ficam fora da lista de proposito: sao `aria-hidden` e nunca
 * aparecem sozinhos, e cor que nao carrega informacao sozinha nao precisa alcancar
 * o limiar de informacao.
 */
function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value
  const channels = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255)
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
}

function contrast(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Le `tokens.css` e resolve a cadeia de `var()` ate o hexadecimal. */
function resolveTokens(dark: boolean): Record<string, string> {
  const css = readFileSync(join(SOURCE_ROOT, 'styles/tokens.css'), 'utf8')
  const darkStart = css.indexOf(':root[data-theme="dark"]')
  const sources = dark ? [css.slice(0, darkStart), css.slice(darkStart)] : [css.slice(0, darkStart)]

  const raw: Record<string, string> = {}
  for (const source of sources) {
    for (const [, name, value] of source.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      if (name && value) raw[name] = value.trim()
    }
  }

  const resolve = (value: string, depth = 0): string => {
    const reference = /^var\(--([\w-]+)\)$/.exec(value)
    const next = reference?.[1] === undefined ? undefined : raw[reference[1]]
    return next !== undefined && depth < 8 ? resolve(next, depth + 1) : value
  }

  return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, resolve(value)]))
}

/** `minimo` e o piso medido, e nao a nota que se quer tirar. Ver a nota acima. */
const PARES: Array<{ fg: string; bg: string; onde: string; minimo: number }> = [
  { fg: 'fg', bg: 'surface', onde: 'texto principal', minimo: 4.5 },
  { fg: 'fg', bg: 'surface-raised', onde: 'texto em cartao', minimo: 4.5 },
  { fg: 'fg-muted', bg: 'surface', onde: 'texto de apoio', minimo: 4.5 },
  { fg: 'fg-muted', bg: 'surface-raised', onde: 'apoio em cartao', minimo: 4.5 },
  { fg: 'error-fg', bg: 'surface-raised', onde: 'texto de campo invalido', minimo: 4.5 },
  { fg: 'accent-fg', bg: 'accent', onde: 'botao primario', minimo: 4.5 },
  { fg: 'active-fg', bg: 'active', onde: 'check do passo concluido', minimo: 3 },
  { fg: 'warn-fg', bg: 'warn-surface', onde: 'painel da chave secreta', minimo: 4.2 },
  { fg: 'fg-placeholder', bg: 'surface-raised', onde: 'exemplo em campo vazio', minimo: 3.5 },
]

describe('contraste dos pares de cor', () => {
  for (const tema of ['claro', 'escuro'] as const) {
    const tokens = resolveTokens(tema === 'escuro')

    for (const par of PARES) {
      it(`${tema}: ${par.onde} tem ao menos ${par.minimo}:1`, () => {
        const fg = tokens[par.fg]
        const bg = tokens[par.bg]
        expect(fg, `--${par.fg} nao resolveu para hexadecimal`).toMatch(/^#[0-9a-f]{3,8}$/i)
        expect(bg, `--${par.bg} nao resolveu para hexadecimal`).toMatch(/^#[0-9a-f]{3,8}$/i)

        expect(contrast(fg ?? '#000', bg ?? '#fff')).toBeGreaterThanOrEqual(par.minimo)
      })
    }
  }
})

/**
 * O favicon e carregado como **documento proprio**, sem acesso ao CSS da
 * aplicacao: os dois valores precisam estar escritos dentro dele. E a unica
 * excecao do projeto — e por isso ela e **conferida**, nao isenta. Antes deste
 * teste a marca da aba estava em duas cores que nao existem na paleta.
 */
describe('a marca na aba do navegador', () => {
  const favicon = readFileSync(join(SOURCE_ROOT, '..', 'public', 'favicon.svg'), 'utf8')

  /** O que o SVG pinta em cada tema: fora do `@media`, e dentro dele. */
  function coresDoFavicon(dark: boolean): string[] {
    const inicioDark = favicon.indexOf('@media (prefers-color-scheme: dark)')
    const trecho = dark ? favicon.slice(inicioDark) : favicon.slice(0, inicioDark)
    return [...new Set([...trecho.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase()))]
  }

  for (const tema of ['claro', 'escuro'] as const) {
    it(`${tema}: a marca da aba usa a mesma cor da marca do cabecalho`, () => {
      const escala = resolveTokens(tema === 'escuro')
      const marcaDaTela = escala.fg?.toLowerCase()
      const cores = coresDoFavicon(tema === 'escuro')

      // `--fg` e o que o `Logo` herda por `currentColor` no cabecalho do painel.
      expect(marcaDaTela).toMatch(/^#[0-9a-f]{6}$/)
      expect(cores.length, `esperava uma cor so no tema ${tema}, achei ${cores.join(', ')}`).toBe(1)
      expect(cores[0]).toBe(marcaDaTela)
    })
  }
})

/**
 * A auditoria da excecao do carregador. Ele desenha **um** elemento na pagina de
 * outra pessoa — o `iframe` — e a unica cor que isso justifica e a sombra que o
 * descola do fundo. Cor de marca, cor de fundo e cor de texto pertencem ao que
 * esta dentro do quadro, onde os tokens valem.
 */
describe('as cores que o carregador escreve na pagina do cliente', () => {
  const loader = readFileSync(join(SOURCE_ROOT, 'loader/main.ts'), 'utf8')

  it('so escreve a sombra, e em preto neutro', () => {
    const cores = [...loader.matchAll(/\b(?:rgba?|hsla?)\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g)].map(
      (match) => match[0],
    )

    expect(cores).toEqual(['rgb(0 0 0 / 18%)'])
  })

  it('nao pinta fundo nem texto: isso e assunto de dentro do quadro', () => {
    const proibidos = ['backgroundColor', 'color =', 'borderColor', 'background =']
      .filter((propriedade) => loader.includes(propriedade))
      .map((propriedade) => `o carregador escreve ${propriedade}`)

    expect(proibidos).toEqual([])
  })
})

/**
 * O HOVER PRECISA SER UM PASSO, NAO UMA COR NOVA
 * ============================================================================
 * Dois defeitos reais, opostos e com a mesma causa — **quanto o hover deve
 * mudar?**: o acento saltava 27 pontos (o rotulo caia de 16:1 para 6:1) e o ambar,
 * por `brightness(0.97)`, rendia 0,2 ponto no tema escuro. A faixa abaixo separa
 * uma coisa da outra, medida na luminosidade HSL.
 */
function lightness(hex: string): number {
  const value = hex.replace('#', '')
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map(
    (i) => Number.parseInt(value.slice(i, i + 2), 16) / 255,
  )
  return ((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100
}

/** Menos que isto ninguem percebe; mais que isto ja e outra cor. */
const PASSO_MINIMO = 3
const PASSO_MAXIMO = 12

const HOVERS: Array<{ repouso: string; hover: string; onde: string }> = [
  { repouso: 'accent', hover: 'accent-hover', onde: 'botao primario' },
  { repouso: 'warn-surface', hover: 'warn-surface-hover', onde: 'botao de gerar chave' },
  { repouso: 'surface', hover: 'surface-sunken', onde: 'botao secundario' },
]

describe('o passo do hover', () => {
  for (const tema of ['claro', 'escuro'] as const) {
    const tokens = resolveTokens(tema === 'escuro')

    for (const par of HOVERS) {
      it(`${tema}: o ${par.onde} muda o suficiente, e nao demais`, () => {
        const repouso = tokens[par.repouso] ?? ''
        const hover = tokens[par.hover] ?? ''
        expect(repouso).toMatch(/^#[0-9a-f]{6}$/i)
        expect(hover).toMatch(/^#[0-9a-f]{6}$/i)

        const passo = Math.abs(lightness(hover) - lightness(repouso))
        expect(passo).toBeGreaterThanOrEqual(PASSO_MINIMO)
        expect(passo).toBeLessThanOrEqual(PASSO_MAXIMO)
      })
    }
  }

  /**
   * Vale para **superficie**, e nao para todo botao: o acento e invertido no tema
   * escuro (quase branco), entao o hover dele tem de escurecer. Regra boa aplicada
   * onde nao cabe vira teste que obriga a piorar o codigo.
   */
  it('no tema escuro, o hover de superficie clareia', () => {
    const tokens = resolveTokens(true)
    const superficies = HOVERS.filter((par) => par.repouso !== 'accent')

    const errados = superficies
      .filter(
        (par) => lightness(tokens[par.hover] ?? '#000') < lightness(tokens[par.repouso] ?? '#000'),
      )
      .map((par) => `${par.onde}: o hover escurece`)

    expect(errados).toEqual([])
  })
})

/**
 * O `cn` PRECISA CONHECER A ESCALA
 * ============================================================================
 * A auditoria de contraste mede **token contra token**, e nunca se a classe que
 * carrega o token chega ao elemento — dava para passar em todos os pares com o
 * rotulo do botao invisivel na tela, e foi o que aconteceu: o `twMerge`
 * descartava `text-accent-fg` por nao distinguir cor de tamanho.
 *
 * Os tres testes abaixo cobrem pontos diferentes da mesma cadeia: a lista, a
 * funcao e o componente.
 */
describe('o cn contra a escala do projeto', () => {
  const cssIndex = () => readFileSync(join(SOURCE_ROOT, 'styles/index.css'), 'utf8')

  const nomesPublicados = (padrao: RegExp) =>
    [...cssIndex().matchAll(padrao)]
      .map((match) => match[1] ?? '')
      .filter((token) => !token.endsWith('--line-height'))

  /** A copia e inevitavel (fonte em CSS, consumidor em TS); o que da para garantir
   *  e que ela nao envelheca calada. */
  it('a lista de tamanhos do cn.ts e a mesma do index.css', () => {
    expect([...fontSizeNames].sort()).toEqual(
      nomesPublicados(/--text-([a-z-]+):(?!\s*initial)/g).sort(),
    )
  })

  it('a lista de cores do cn.ts e a mesma do index.css', () => {
    expect([...colorNames].sort()).toEqual(nomesPublicados(/--color-([a-z-]+):/g).sort())
  })

  /** Cor e tamanho sao eixos independentes: juntar um de cada nunca descarta. */
  it('juntar cor com tamanho nunca descarta nenhum dos dois', () => {
    const perdas: string[] = []

    for (const size of fontSizeNames) {
      for (const color of colorNames) {
        for (const [a, b] of [
          [`text-${size}`, `text-${color}`],
          [`text-${color}`, `text-${size}`],
        ]) {
          const saida = cn(a, b).split(' ')
          if (!saida.includes(a ?? '') || !saida.includes(b ?? '')) perdas.push(`${a} + ${b}`)
        }
      }
    }

    expect(perdas).toEqual([])
  })

  /**
   * O mesmo defeito conferido onde apareceu. `Button` e funcao pura: da para
   * chama-la e ler o `className`, sem navegador. A asserticao e sobre o **par** —
   * variante nova que esquecer a cor tambem reprova.
   */
  const VARIANTES: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'quiet', 'warn']

  for (const variant of VARIANTES) {
    for (const size of ['md', 'sm'] as const) {
      it(`o botao ${variant}/${size} sai com cor de texto e tamanho de texto`, () => {
        const classes = String(Button({ variant, size }).props.className).split(' ')

        expect(classes.filter((c) => colorNames.some((n) => c === `text-${n}`))).toHaveLength(1)
        expect(classes.filter((c) => fontSizeNames.some((n) => c === `text-${n}`))).toHaveLength(1)
      })
    }
  }
})
