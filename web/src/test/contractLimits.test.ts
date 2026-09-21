import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MAX_CLOSURE_REASON_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_INFO_REQUEST_DAYS,
  MAX_PUBLIC_DELAY_MINUTES,
  MAX_REOPEN_COMMENT_LENGTH,
  MAX_REPORT_TEXT_LENGTH,
  MAX_REPORTER_NAME_LENGTH,
} from '@/contracts'

/**
 * OS LIMITES E OS ENUMS EXISTEM EM DUAS LINGUAGENS, E PRECISAM CONTINUAR IGUAIS
 * ============================================================================
 *
 * O formulário corta o texto no `maxLength` do TypeScript; a API recusa pelo
 * `const` do C#. **Os dois números são o mesmo limite escrito duas vezes**, e
 * quem afrouxar um lado sozinho não quebra nada — só muda quem recusa.
 *
 * E os dois jeitos de divergir são ruins de maneiras diferentes:
 *
 * - **TypeScript maior que C#**: a pessoa escreve até o fim, clica em enviar e
 *   perde o texto numa recusa que a tela deixou ela alcançar.
 * - **TypeScript menor que C#**: o campo corta antes, sem dizer por quê, e o
 *   limite de verdade vira invisível.
 *
 * Os enums têm o mesmo problema com outra cara: um valor novo no C# que não
 * chegue aqui faz o `select` da tela não ter a opção — e o valor existir na API
 * sem ninguém conseguir escolhê-lo.
 *
 * Este teste segue o desenho de `eventTypes.test.ts`: lê o arquivo C# de verdade,
 * e falha dizendo o que mudou em vez de deixar passar.
 */
function csharp(caminho: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../api/${caminho}`, import.meta.url)), 'utf8')
}

/** O valor de um `const int` — aceitando a conta escrita, como `7 * 24 * 60`. */
function constante(fonte: string, nome: string): number | null {
  const achado = fonte.match(new RegExp(`const int ${nome}\\s*=\\s*([^;]+);`))
  const expressao = achado?.[1]?.trim()
  if (expressao === undefined) return null

  // Só dígitos, operadores e espaço: o arquivo é nosso, mas a regra vale sempre.
  if (!/^[\d\s*+\-/()]+$/.test(expressao)) return null

  return Number(new Function(`return (${expressao})`)())
}

/** Os membros de um enum C#, sem os comentários. */
function membros(fonte: string): string[] {
  const corpo = fonte
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '')

  return corpo
    .slice(corpo.indexOf('{') + 1, corpo.lastIndexOf('}'))
    .split(',')
    .map((membro) => membro.trim())
    .filter((membro) => membro.length > 0)
}

const CLOSURE = csharp('Pds.Domain/Entities/ReportClosure/ReportClosure.cs')
const CICLO = csharp('Pds.Domain/Entities/ProjectCycleSettings/ProjectCycleSettings.cs')
const RELATO = csharp('Pds.Domain/Entities/Report/Report.cs')
const COMENTARIO = csharp('Pds.Domain/Entities/ReportComment/ReportPublicComment.cs')

const LIMITES: ReadonlyArray<[string, string, number]> = [
  ['ReportClosure.MaxReasonLength', CLOSURE, MAX_CLOSURE_REASON_LENGTH],
  ['ReportClosure.MaxReopenCommentLength', CLOSURE, MAX_REOPEN_COMMENT_LENGTH],
  ['ProjectCycleSettings.MaxPublicDelayMinutes', CICLO, MAX_PUBLIC_DELAY_MINUTES],
  ['ProjectCycleSettings.MaxInfoRequestDays', CICLO, MAX_INFO_REQUEST_DAYS],
  ['Report.MaxTextLength', RELATO, MAX_REPORT_TEXT_LENGTH],
  ['Report.MaxReporterNameLength', RELATO, MAX_REPORTER_NAME_LENGTH],
  ['ReportPublicComment.MaxBodyLength', COMENTARIO, MAX_COMMENT_LENGTH],
]

describe('os limites de tamanho, dos dois lados', () => {
  for (const [caminho, fonte, noTypeScript] of LIMITES) {
    // `ReportClosure.MaxReasonLength` -> `MaxReasonLength`. O caminho inteiro fica
    // no nome do teste, para a falha dizer em qual arquivo C# olhar.
    const nome = caminho.slice(caminho.indexOf('.') + 1)

    it(`${caminho} continua existindo no C#`, () => {
      // Sem isto, um `const` renomeado faria o teste comparar nulo com nulo e
      // passar — que é exatamente o silêncio que ele existe para quebrar.
      expect(constante(fonte, nome)).not.toBeNull()
    })

    it(`${caminho} vale o mesmo no TypeScript`, () => {
      expect(constante(fonte, nome)).toBe(noTypeScript)
    })
  }
})

const ENUMS: ReadonlyArray<[string, readonly string[]]> = [
  ['ClosureTriggerEnum', ['LastColumn', 'Button']],
  ['SatisfactionStyleEnum', ['Stars', 'Number']],
  ['PublicOutcomeEnum', ['Done', 'WontDo', 'NoAnswer', 'Duplicate']],
  ['ReportTypeEnum', ['Bug', 'Improvement', 'Question']],
  ['ReporterIdentityModeEnum', ['Protocol', 'PersonalCode', 'InheritedIdentity']],
  ['ReportVisibilityEnum', ['Private', 'PublicAnonymous', 'PublicIdentified']],
  ['ReportModerationStateEnum', ['Pending', 'Approved', 'Rejected']],
]

describe('os enums que a tela escolhe, dos dois lados', () => {
  for (const [arquivo, noTypeScript] of ENUMS) {
    it(`${arquivo} tem os mesmos valores, na mesma ordem`, () => {
      // A lista do TypeScript é uma união de literais, e união some na compilação:
      // não há como lê-la em tempo de execução. Então ela está escrita aqui, e o
      // que este teste garante é que o C# não andou sozinho.
      expect(membros(csharp(`Pds.Domain/Enums/${arquivo}.cs`))).toEqual([...noTypeScript])
    })
  }
})
