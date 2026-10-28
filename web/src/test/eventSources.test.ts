import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { REPORT_EVENT_SOURCES } from '@/contracts'

/**
 * AS ORIGENS DE EVENTO EXISTEM EM DUAS LINGUAGENS, E PRECISAM CONTINUAR IGUAIS
 * ============================================================================
 *
 * A rota de historico devolve a origem de cada evento com o nome do `EventSourceEnum`
 * em C#, e e por ela que a linha do tempo separa a leitura de quem relatou
 * (`PublicPage`) da do time. Uma origem renomeada so do lado do C# faria a leitura de
 * quem relatou voltar a aparecer como se fosse o time — sem erro em lugar nenhum. O
 * mesmo motivo de `eventTypes.test.ts`, e o mesmo jeito: este teste le o arquivo C#.
 */
const CSHARP = fileURLToPath(
  new URL('../../../api/Pds.Domain/Enums/EventSourceEnum.cs', import.meta.url),
)

/** Os membros do enum: o que sobra depois de tirar os comentarios e o cabecalho. */
function parseMembers(source: string): string[] {
  const body = source
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '')

  return body
    .slice(body.indexOf('{') + 1, body.lastIndexOf('}'))
    .split(',')
    .map((member) => member.trim())
    .filter(Boolean)
}

describe('as origens de evento, dos dois lados', () => {
  const csharp = parseMembers(readFileSync(CSHARP, 'utf8'))

  it('o arquivo C# ainda e um enum com membros — se parou de ser, o resto deste teste nao vale', () => {
    expect(csharp.length).toBeGreaterThan(0)
  })

  it('a lista do TypeScript tem exatamente os mesmos nomes, na mesma ordem', () => {
    expect([...REPORT_EVENT_SOURCES]).toEqual(csharp)
  })
})
