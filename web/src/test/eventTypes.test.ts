import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { REPORT_EVENT_TYPES } from '@/contracts'

/**
 * OS TIPOS DE EVENTO EXISTEM EM DUAS LINGUAGENS, E PRECISAM CONTINUAR IGUAIS
 * ==========================================================================
 *
 * A rota de historico devolve o tipo de cada evento com o nome do `EventTypeEnum`
 * em C#, e a linha do tempo do painel traduz cada nome numa frase. Quem acrescenta
 * um tipo mexe no C#, e nada obriga a mexer aqui.
 *
 * **Isso ja aconteceu, e nao deu erro em lugar nenhum.** Os dois tipos da jornada
 * publica nasceram no C# e ficaram de fora do TypeScript. Nao quebrou: `descrever`
 * cai no proprio valor quando nao conhece o tipo — e a linha do tempo passou a
 * mostrar `ReportPublicStageChanged` na tela, em ingles, entre frases em
 * portugues. Ninguem viu, porque o painel nao abriu; e mesmo aberto, so apareceria
 * num relato que tivesse passado por uma etapa publica.
 *
 * Este teste le o arquivo C#. Se ele for renomeado ou mudar de forma, o teste
 * falha dizendo isso, e nao em silencio.
 */
const CSHARP = fileURLToPath(
  new URL('../../../api/Pds.Domain/Enums/EventTypeEnum.cs', import.meta.url),
)

/**
 * Le os membros do enum: o que sobra depois de tirar comentarios de bloco, de
 * linha e o cabecalho do proprio `enum`.
 *
 * So interessam os que comecam com `Report`. O enum pode ganhar um dia um tipo
 * que nao fale de relato — de projeto, de conta —, e esse nao passaria pela rota
 * de historico nem precisaria de frase.
 */
function parseMembers(source: string): string[] {
  const body = source
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '')

  const inside = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'))

  return inside
    .split(',')
    .map((member) => member.trim())
    .filter((member) => member.startsWith('Report'))
}

describe('os tipos de evento, dos dois lados', () => {
  const csharp = parseMembers(readFileSync(CSHARP, 'utf8'))

  it('o arquivo C# ainda e um enum com membros — se parou de ser, o resto deste teste nao vale', () => {
    expect(csharp.length).toBeGreaterThan(0)
  })

  it('a lista do TypeScript tem exatamente os mesmos nomes, na mesma ordem', () => {
    expect([...REPORT_EVENT_TYPES]).toEqual(csharp)
  })
})
