import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * OS PADROES DA FERRAMENTA EXISTEM EM DUAS LINGUAGENS, E PRECISAM CONTINUAR IGUAIS
 * ============================================================================
 *
 * A API devolve os padroes para projeto que nunca salvou nada; o quadro usa os
 * dele quando a leitura falha. Nao da para ter so uma copia: a segunda existe
 * justamente para o momento em que a primeira nao chega.
 *
 * O problema e que a divergencia so apareceria **com a API fora do ar** — o pior
 * momento possivel para descobrir que o texto padrao e outro. Aqui ela reprova o
 * `npm test`, com o campo e os dois valores.
 *
 * Este teste le o arquivo C#. Se ele for renomeado ou mudar de forma, o teste
 * falha dizendo isso, e nao em silencio.
 */
const CSHARP = fileURLToPath(
  new URL(
    '../../../api/Pds.Domain/Entities/ProjectWidgetSettings/WidgetSettingsDefaults.cs',
    import.meta.url,
  ),
)

/**
 * Le `public const <tipo> <Nome> = <valor>;`, inclusive quando o valor cai para a
 * linha de baixo — e o caso dos dois textos longos.
 */
function parseDefaults(source: string): Record<string, unknown> {
  const found: Record<string, unknown> = {}

  for (const match of source.matchAll(/public const \S+\?? (\w+)\s*=\s*([^;]+);/g)) {
    const name = match[1] ?? ''
    const raw = (match[2] ?? '').trim()

    found[name] = readValue(raw)
  }

  return found
}

function readValue(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null

  // Texto: pode estar quebrado em varias linhas, mas e sempre um literal so.
  if (raw.startsWith('"')) return raw.slice(1, raw.lastIndexOf('"'))

  // `WidgetPositionEnum.BottomRight` vira `BottomRight`, que e como o JSON sai.
  return raw.slice(raw.lastIndexOf('.') + 1)
}

describe('os padroes da ferramenta, dos dois lados', () => {
  const csharp = parseDefaults(readFileSync(CSHARP, 'utf8'))

  it('o arquivo C# ainda tem os dez campos — se parou de ter, o resto deste teste nao vale', () => {
    expect(Object.keys(csharp).sort()).toEqual(Object.keys(DEFAULT_WIDGET_SETTINGS).sort())
  })

  for (const [campo, valor] of Object.entries(DEFAULT_WIDGET_SETTINGS)) {
    it(`${campo} e o mesmo no C# e no TypeScript`, () => {
      expect(csharp[campo]).toEqual(valor)
    })
  }
})
