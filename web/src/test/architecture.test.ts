import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A REGRA DE DEPENDENCIA, CONFERIDA POR TESTE
 * ============================================================================
 *
 *              app             monta as telas; ninguem importa dele
 *               ↓
 *            features         um assunto por pasta; nao se importam entre si
 *             ↓    ↓
 *          data    shared     data usa de shared apenas `lib/`
 *             ↓    ↓
 *           contracts         a base: nao depende de nada
 *
 * A regra no README nao impede ninguem de quebra-la, e o dia em que isso acontece
 * e um dia corrido. Aqui ela falha no `npm test`, com arquivo e linha.
 *
 * A mais importante e a primeira: **nenhuma tela alcanca o cliente HTTP**. Um
 * unico `import '@/data/api/...'` numa tela espalha o conhecimento de rota,
 * cabecalho e envelope pela interface, e trocar a implementacao deixa de ser
 * mexer num arquivo.
 */

const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url))

interface Rule {
  /** Pasta a que a regra se aplica, relativa a `src/`. */
  folder: string
  /** Prefixos de import proibidos ali dentro. */
  forbidden: string[]
  why: string
}

const RULES: Rule[] = [
  {
    folder: 'features',
    forbidden: ['@/data/api'],
    why: 'tela fala com a interface do servico, nunca com o cliente HTTP',
  },
  {
    folder: 'features',
    forbidden: ['@/app'],
    why: 'a casca monta as telas; tela que importa da casca inverte a direcao da camada',
  },
  {
    folder: 'app',
    forbidden: ['@/data/api'],
    why: 'a casca tambem fala so com a interface do servico',
  },
  {
    folder: 'shared',
    forbidden: ['@/data/api', '@/features', '@/app'],
    why: 'o que e compartilhado nao pode depender de quem o usa, senao deixa de ser reaproveitavel',
  },
  {
    folder: 'contracts',
    forbidden: ['@/data', '@/features', '@/app', '@/shared'],
    why: 'contrato e a base de tudo e nao depende de nada',
  },
  {
    folder: 'embed',
    forbidden: ['@/data/api', '@/app', '@/features'],
    why: 'o quadro roda dentro do site de um cliente: casca, telas e cliente HTTP nao entram la',
  },
  {
    folder: 'loader',
    forbidden: ['@/data', '@/app', '@/features', '@/shared', '@/contracts'],
    why: 'o carregador roda na pagina do cliente, fora do nosso documento: nada do painel pode alcancar ele',
  },
  {
    folder: 'data',
    forbidden: ['@/features', '@/app'],
    why: 'a camada de dados nao conhece tela',
  },
  {
    folder: 'data',
    forbidden: ['@/shared/components', '@/shared/hooks'],
    why: 'de shared, a camada de dados usa so `lib/` — componente e hook sao interface',
  },
]

/**
 * Os pontos de acesso a camada de dados. Sao **dois**, e a separacao e o que
 * mantem o codigo de sessao fora do que roda dentro do site de um cliente:
 * `data/index.ts` liga os servicos do painel e arrasta `sessionToken` junto;
 * `data/publicIndex.ts` liga so o que funciona sem sessao.
 *
 * Foi medido, e nao suposto: com o quadro importando `@/data`, o pacote de
 * `embed.html` continha a chave `pds.web.session`.
 */
const ACCESS_POINTS = ['data/index.ts', 'data/publicIndex.ts']

function listFiles(directory: string): string[] {
  const entries = readdirSync(directory)
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry)

    if (statSync(path).isDirectory()) {
      files.push(...listFiles(path))
      continue
    }

    if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts')) files.push(path)
  }

  return files
}

/** Todo import do arquivo, inclusive o de efeito colateral, sem `from`. */
function importsOf(content: string): string[] {
  return [...content.matchAll(/(?:from|^\s*import)\s+'([^']+)'/gm)].map((match) => match[1] ?? '')
}

describe('regra de dependencia entre as pastas', () => {
  for (const rule of RULES) {
    it(`${rule.folder}/ não importa ${rule.forbidden.join(', ')} — ${rule.why}`, () => {
      const violations: string[] = []

      for (const file of listFiles(join(SOURCE_ROOT, rule.folder))) {
        for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
          if (rule.forbidden.some((prefix) => specifier.startsWith(prefix))) {
            violations.push(`${relative(SOURCE_ROOT, file)} importa ${specifier}`)
          }
        }
      }

      expect(violations).toEqual([])
    })
  }

  /**
   * A lista nao existe para autorizar: existe para **obrigar a escrever o motivo**.
   * Quando um import entre features incomoda, a pergunta costuma ser "isso e mesmo
   * desta feature?" — foi assim que `useCurrentProject` e `Brand` foram para
   * `shared/` e deixaram de precisar de excecao.
   */
  const CROSS_FEATURE_ALLOWED: Array<{ from: string; to: string; why: string }> = [
    {
      from: 'features/projects/ProjectsHubScreen.tsx',
      to: '@/features/auth/sessionStore',
      why: 'a saudacao "Ola, Cleiton" precisa de quem esta logado, e sessao e assunto de auth',
    },
  ]

  it('uma feature nao importa de outra, fora das excecoes escritas', () => {
    const violations: string[] = []

    for (const file of listFiles(join(SOURCE_ROOT, 'features'))) {
      const path = relative(SOURCE_ROOT, file)
      const owner = path.split('/')[1] ?? ''

      for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('@/features/')) continue
        if (specifier.startsWith(`@/features/${owner}/`)) continue

        const allowed = CROSS_FEATURE_ALLOWED.some(
          (item) => item.from === path && item.to === specifier,
        )
        if (!allowed) violations.push(`${path} importa ${specifier}`)
      }
    }

    expect(violations).toEqual([])
  })

  it('nenhuma excecao entre features sobrou na lista sem ser usada', () => {
    // Excecao que ninguem exerce vira precedente para a proxima.
    const stale = CROSS_FEATURE_ALLOWED.filter(
      (item) => !readFileSync(join(SOURCE_ROOT, item.from), 'utf8').includes(`'${item.to}'`),
    ).map((item) => `${item.from} nao importa mais ${item.to}`)

    expect(stale).toEqual([])
  })

  /**
   * Interface sem implementacao e promessa; implementacao que ninguem exporta no
   * `index.ts` e codigo que a tela nao alcanca. Quando Relatos, Membros e Uso
   * chegarem, cada um entra como servico proprio e passa por aqui.
   */
  it('todo servico tem implementacao de API e sai pelo ponto de acesso', () => {
    const problemas: string[] = []
    const acesso = ACCESS_POINTS.map((nome) => readFileSync(join(SOURCE_ROOT, nome), 'utf8')).join(
      '\n',
    )

    for (const file of listFiles(join(SOURCE_ROOT, 'data'))) {
      const nome = relative(SOURCE_ROOT, file)
      const match = /^data\/(\w+)Service\.ts$/.exec(nome)
      if (!match) continue

      const recurso = match[1] ?? ''
      const maiuscula = recurso.charAt(0).toUpperCase() + recurso.slice(1)

      if (!existsSync(join(SOURCE_ROOT, 'data', 'api', `api${maiuscula}Service.ts`))) {
        problemas.push(`${nome} nao tem implementacao em data/api/api${maiuscula}Service.ts`)
      }

      if (!acesso.includes(`api${maiuscula}Service`)) {
        problemas.push(`data/index.ts nao exporta ${recurso}Service`)
      }
    }

    expect(problemas).toEqual([])
  })

  /**
   * O carregador e a unica coisa nossa que roda no documento do cliente. Cada
   * import que ele ganha vira peso e superficie na pagina de outra pessoa — por
   * isso a lista do que ele pode conhecer e **uma linha**, e nao um prefixo.
   */
  it('o carregador so importa o protocolo', () => {
    const PERMITIDO = ['@/embed/protocol']
    const offenders: string[] = []

    for (const file of listFiles(join(SOURCE_ROOT, 'loader'))) {
      for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('@/')) continue
        if (PERMITIDO.includes(specifier)) continue
        offenders.push(`${relative(SOURCE_ROOT, file)} importa ${specifier}`)
      }
    }

    expect(offenders).toEqual([])
  })

  /**
   * `@/data` compila e funciona dentro do quadro — por isso precisa de teste. O
   * que ele traz junto nao aparece em revisao nenhuma: aparece no pacote.
   */
  it('o quadro embutido nao importa o ponto de acesso do painel', () => {
    const offenders: string[] = []

    for (const file of listFiles(join(SOURCE_ROOT, 'embed'))) {
      for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
        if (specifier === '@/data' || specifier === '@/data/index') {
          offenders.push(`${relative(SOURCE_ROOT, file)} importa ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('somente os pontos de acesso importam de data/api', () => {
    const injectionPoints = ACCESS_POINTS.map((nome) => join(SOURCE_ROOT, nome))
    const offenders: string[] = []

    for (const file of listFiles(join(SOURCE_ROOT, 'data'))) {
      if (injectionPoints.includes(file)) continue

      // Dentro de `data/api` os arquivos se importam a vontade; o que nao pode e
      // o resto da camada alcancar o cliente HTTP por fora do ponto de acesso.
      const insideApi = file.includes('/data/api/')

      for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('@/data/api') && !insideApi) {
          offenders.push(`${relative(SOURCE_ROOT, file)} importa ${specifier}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

/** Duas decisoes deliberadas e incomuns — do tipo que alguem "conserta" de boa-fe. */
describe('convencoes que o codigo declara e ninguem conferia', () => {
  /**
   * `contracts/` espelha os view models em C#, que sao `PascalCase`. Um campo em
   * `camelCase` **compila e passa no lint**, le uma chave que o JSON nao tem e
   * entrega `undefined` — a tela mostra vazio sem erro nenhum.
   */
  it('todo campo de contrato comeca em maiuscula, como o C#', () => {
    const violations: string[] = []

    for (const file of listFiles(join(SOURCE_ROOT, 'contracts'))) {
      const path = relative(SOURCE_ROOT, file)
      if (path.endsWith('index.ts')) continue

      const content = readFileSync(file, 'utf8')

      for (const [, body] of content.matchAll(/export interface \w+[^{]*\{([^}]*)\}/g)) {
        for (const [, field] of (body ?? '').matchAll(/^\s{2}(\w+)\??:/gm)) {
          if (field && field[0] !== field[0]?.toUpperCase()) {
            violations.push(`${path}: campo \`${field}\` deveria ser PascalCase`)
          }
        }
      }
    }

    expect(violations).toEqual([])
  })

  /**
   * **Nao existe variante vermelha de botao** (o motivo esta no `Button.tsx`).
   * Quase todo sistema de design tem `danger`, e quem chega tende a achar que aqui
   * falta. Olha so os dois arquivos que desenham botao: o `bg-error-fg` do ponto
   * do `Toaster` e legitimo.
   */
  it('nenhum botao de acao usa a cor de erro', () => {
    const violations: string[] = []

    for (const name of ['shared/components/Button.tsx', 'shared/components/ConfirmDialog.tsx']) {
      const content = readFileSync(join(SOURCE_ROOT, name), 'utf8')

      for (const [match] of content.matchAll(/\b(?:bg|border|text)-error-[\w-]+/g)) {
        violations.push(`${name} usa \`${match}\``)
      }

      for (const [match] of content.matchAll(/'(danger|destructive|delete|remove)'/g)) {
        violations.push(`${name} declara a variante ${match}`)
      }
    }

    expect(violations).toEqual([])
  })
})
