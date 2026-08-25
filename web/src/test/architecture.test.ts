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
 * A mais importante e a primeira: **nenhuma tela alcanca o mock nem o cliente
 * HTTP**. Um unico `import '@/data/mock/...'` numa tela transforma "trocar mock
 * por API e uma linha" em mentira, e ninguem percebe ate a hora de ligar.
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
    forbidden: ['@/data/mock', '@/data/api'],
    why: 'tela nao escolhe de onde vem o dado — quem escolhe e data/index.ts',
  },
  {
    folder: 'features',
    forbidden: ['@/app'],
    why: 'a casca monta as telas; tela que importa da casca inverte a direcao da camada',
  },
  {
    folder: 'app',
    forbidden: ['@/data/mock', '@/data/api'],
    why: 'a casca tambem fala so com a interface PanelService',
  },
  {
    folder: 'shared',
    forbidden: ['@/data/mock', '@/data/api', '@/features', '@/app'],
    why: 'o que e compartilhado nao pode depender de quem o usa, senao deixa de ser reaproveitavel',
  },
  {
    folder: 'contracts',
    forbidden: ['@/data', '@/features', '@/app', '@/shared'],
    why: 'contrato e a base de tudo e nao depende de nada',
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
   * A promessa da camada de dados nao e "existe um mock", e sim que **mock e API
   * sao intercambiaveis** — o que so se prova com os dois escritos. O caminho curto
   * ("so o mock agora, a API depois") e o que este teste torna impossivel de fazer
   * calado quando Relatos, Membros e Uso chegarem.
   */
  it('todo servico tem mock, tem API, e e escolhido no ponto de injecao', () => {
    const problemas: string[] = []
    const injecao = readFileSync(join(SOURCE_ROOT, 'data', 'index.ts'), 'utf8')

    for (const file of listFiles(join(SOURCE_ROOT, 'data'))) {
      const nome = relative(SOURCE_ROOT, file)
      const match = /^data\/(\w+)Service\.ts$/.exec(nome)
      if (!match) continue

      const recurso = match[1] ?? ''
      const maiuscula = recurso.charAt(0).toUpperCase() + recurso.slice(1)

      for (const lado of ['mock', 'api']) {
        const caminho = join(SOURCE_ROOT, 'data', lado, `${lado}${maiuscula}Service.ts`)
        if (!existsSync(caminho)) {
          problemas.push(
            `${nome} nao tem o lado \`${lado}\` em data/${lado}/${lado}${maiuscula}Service.ts`,
          )
        }
      }

      // O ternario tem de estar aqui, e nao espalhado.
      if (
        !injecao.includes(`api${maiuscula}Service`) ||
        !injecao.includes(`mock${maiuscula}Service`)
      ) {
        problemas.push(`data/index.ts nao escolhe entre os dois lados de ${recurso}Service`)
      }
    }

    expect(problemas).toEqual([])
  })

  it('somente data/index.ts decide entre mock e API', () => {
    const injectionPoint = join(SOURCE_ROOT, 'data', 'index.ts')
    const offenders: string[] = []

    for (const file of listFiles(join(SOURCE_ROOT, 'data'))) {
      if (file === injectionPoint) continue

      // Dentro de cada lado os arquivos se importam a vontade; o que nao pode e um
      // lado enxergar o outro.
      const insideMock = file.includes('/data/mock/')
      const insideApi = file.includes('/data/api/')

      for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('@/data/mock') && !insideMock) {
          offenders.push(`${relative(SOURCE_ROOT, file)} importa ${specifier}`)
        }
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
