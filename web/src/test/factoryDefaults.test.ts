import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CYCLE_DEFAULTS, MEDIA_DEFAULTS } from '@/shared/lib/factoryDefaults'

/**
 * OS PADROES DE FABRICA DO PAINEL SAO UMA COPIA DOS DO C#, E PRECISAM CONTINUAR IGUAIS
 * ================================================================================
 *
 * O "Mais opções" de cada tela diz "Tudo no padrão" e oferece "Voltar ao padrão" — e o
 * padrao das regras do ciclo e dos anexos so existe no C#: a API o aplica a projeto que
 * nunca salvou nada, mas nao o devolve na leitura. A copia do painel mora em
 * `shared/lib/factoryDefaults.ts`.
 *
 * Se as duas divergirem, a tela diria "Tudo no padrão" para um valor que nao e o de
 * fabrica, e "Voltar ao padrão" gravaria outro numero. Aqui a divergencia reprova o
 * `npm test`, com o campo e os dois valores. Como em `widgetDefaults.test.ts`, este
 * teste le os arquivos C#; se a forma deles mudar, ele falha dizendo isso.
 */
const raiz = (caminho: string) =>
  fileURLToPath(new URL(`../../../api/Pds.Domain/Entities/${caminho}`, import.meta.url))

const CICLO = raiz('ProjectCycleSettings/CycleSettingsDefaults.cs')
const ANEXOS = raiz('ProjectMediaSettings/MediaSettingsDefaults.cs')

/** `public const <tipo> Nome = valor;` e `public static readonly <tipo> Nome = valor;`. */
function lerConstantes(fonte: string): Record<string, string> {
  const achadas: Record<string, string> = {}
  for (const casou of fonte.matchAll(
    /public (?:const|static readonly) [\w<>?,() ]+? (\w+)\s*=\s*([^;]+);/g,
  )) {
    achadas[casou[1] ?? ''] = (casou[2] ?? '').trim()
  }
  return achadas
}

/** O valor como o JSON da API sai: enum pelo nome, numero, booleano, nulo. */
function valor(cru: string): unknown {
  if (cru === 'true') return true
  if (cru === 'false') return false
  if (cru === 'null') return null
  if (/^-?\d+$/.test(cru)) return Number(cru)
  return cru.slice(cru.lastIndexOf('.') + 1)
}

/** `5L * 1024 * 1024` vira o numero: so multiplicacao de inteiros, que e o que o arquivo usa. */
function conta(expressao: string): number {
  return expressao
    .split('*')
    .map((parte) => Number(parte.trim().replace(/L$/, '')))
    .reduce((produto, fator) => produto * fator, 1)
}

/** `(3, 5L * 1024 * 1024)` vira `[3, 5242880]`; booleano fica booleano. */
function tupla(cru: string): Array<number | boolean> {
  return cru
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((parte) => parte.trim())
    .map((parte) => (parte === 'true' ? true : parte === 'false' ? false : conta(parte)))
}

/** O nome do campo no C#, quando nao e o mesmo do contrato do painel. */
const NOME_NO_CSHARP: Partial<Record<keyof typeof CYCLE_DEFAULTS, string>> = {
  // O C# guarda o id interno da coluna; o painel fala o identificador publico. Os
  // dois sao nulos de fabrica: "a primeira coluna da fila".
  ReopenStatePublicId: 'ReopenStateId',
}

describe('os padrões de fábrica do ciclo, dos dois lados', () => {
  const csharp = lerConstantes(readFileSync(CICLO, 'utf8'))

  it('o arquivo C# ainda foi lido — senão o resto deste teste não vale', () => {
    expect(Object.keys(csharp).length).toBeGreaterThan(10)
  })

  for (const [campo, esperado] of Object.entries(CYCLE_DEFAULTS)) {
    const nome = NOME_NO_CSHARP[campo as keyof typeof CYCLE_DEFAULTS] ?? campo

    it(`${campo} é o mesmo no C# e no TypeScript`, () => {
      expect(csharp, `falta ${nome} em CycleSettingsDefaults.cs`).toHaveProperty(nome)
      expect(valor(csharp[nome] ?? '')).toEqual(esperado)
    })
  }
})

describe('os padrões de fábrica dos anexos, dos dois lados', () => {
  const csharp = lerConstantes(readFileSync(ANEXOS, 'utf8'))

  for (const campo of [
    'IsEnabled',
    'AllowsScreenCapture',
    'AllowsOnInfoRequest',
    'AllowsOnReopen',
  ] as const) {
    it(`${campo} é o mesmo no C# e no TypeScript`, () => {
      expect(csharp).toHaveProperty(campo)
      expect(valor(csharp[campo] ?? '')).toBe(MEDIA_DEFAULTS[campo])
    })
  }

  it('a imagem: ligada, com a mesma quantidade e o mesmo tamanho', () => {
    const [quantos, bytes] = tupla(csharp.Image ?? '')
    expect(MEDIA_DEFAULTS.Kinds.Image).toEqual({
      IsEnabled: true,
      MaxCount: quantos,
      MaxBytes: bytes,
    })
  })

  it('o arquivo: desligado, com a mesma quantidade e o mesmo tamanho', () => {
    const [ligado, quantos, bytes] = tupla(csharp.File ?? '')
    expect(MEDIA_DEFAULTS.Kinds.File).toEqual({
      IsEnabled: ligado,
      MaxCount: quantos,
      MaxBytes: bytes,
    })
  })
})
