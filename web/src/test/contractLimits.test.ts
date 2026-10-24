import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CARD_COLORS,
  MAX_ACTIVE_REPORT_TYPES,
  MAX_BLOCKED_ORIGINS,
  MAX_CARD_TITLE_LENGTH,
  MAX_CLOSURE_REASON_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_DUE_SOON_DAYS,
  MAX_INFO_REQUEST_DAYS,
  MAX_LABEL_NAME_LENGTH,
  MAX_LABELS_PER_CARD,
  MAX_LAST_COLUMN_VISIBLE_DAYS,
  MAX_MODERATION_PAGE_SIZE,
  MAX_PRIORITY_NAME_LENGTH,
  MAX_PUBLIC_DELAY_MINUTES,
  MAX_PUBLISHED_LISTED,
  MAX_REOPEN_COMMENT_LENGTH,
  MAX_REPORT_ANSWER_LENGTH,
  MAX_REPORT_TEXT_LENGTH,
  MAX_REPORT_TYPE_NAME_LENGTH,
  MAX_REPORT_TYPE_QUESTION_LENGTH,
  MAX_REPORT_TYPE_QUESTIONS,
  MAX_REPORTER_NAME_LENGTH,
  MAX_TEXT_BOX_PROMPT_LENGTH,
  MODERATION_PAGE_SIZE,
  type ObservedOriginStatus,
  type ProjectTemplate,
  REPORT_TYPE_ICONS,
  WIDGET_APPEARANCE_LIMITS,
  WIDGET_TEXT_LIMITS,
  type WidgetLauncherIcon,
  type WidgetLauncherShape,
  type WidgetMobileMode,
} from '@/contracts'
import { LAUNCHER_POSITIONS, LAUNCHER_SIZES, MAX_OFFSET } from '@/embed/launcher'

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
const PRIORIDADE = csharp('Pds.Domain/Entities/ProjectPriority/ProjectPriority.cs')
const ETIQUETA = csharp('Pds.Domain/Entities/ProjectLabel/ProjectLabel.cs')
const TIPO = csharp('Pds.Domain/Entities/ProjectReportType/ProjectReportType.cs')
const FERRAMENTA = csharp('Pds.Domain/Entities/ProjectWidgetSettings/ProjectWidgetSettings.cs')
const BLOQUEADO = csharp('Pds.Domain/Entities/ProjectBlockedOrigin/ProjectBlockedOrigin.cs')

const LIMITES: ReadonlyArray<[string, string, number]> = [
  ['ReportClosure.MaxReasonLength', CLOSURE, MAX_CLOSURE_REASON_LENGTH],
  ['ReportClosure.MaxReopenCommentLength', CLOSURE, MAX_REOPEN_COMMENT_LENGTH],
  ['ProjectCycleSettings.MaxPublicDelayMinutes', CICLO, MAX_PUBLIC_DELAY_MINUTES],
  ['ProjectCycleSettings.MaxInfoRequestDays', CICLO, MAX_INFO_REQUEST_DAYS],
  ['ProjectCycleSettings.MaxLastColumnVisibleDays', CICLO, MAX_LAST_COLUMN_VISIBLE_DAYS],
  ['ProjectCycleSettings.MaxDueSoonDays', CICLO, MAX_DUE_SOON_DAYS],
  ['Report.MaxTextLength', RELATO, MAX_REPORT_TEXT_LENGTH],
  ['Report.MaxReporterNameLength', RELATO, MAX_REPORTER_NAME_LENGTH],
  ['ReportPublicComment.MaxBodyLength', COMENTARIO, MAX_COMMENT_LENGTH],
  ['Report.MaxTitleLength', RELATO, MAX_CARD_TITLE_LENGTH],
  ['Report.MaxLabelsPerCard', RELATO, MAX_LABELS_PER_CARD],
  ['Report.ModerationPageSize', RELATO, MODERATION_PAGE_SIZE],
  ['Report.MaxModerationPageSize', RELATO, MAX_MODERATION_PAGE_SIZE],
  ['Report.MaxPublishedListed', RELATO, MAX_PUBLISHED_LISTED],
  ['ProjectPriority.MaxNameLength', PRIORIDADE, MAX_PRIORITY_NAME_LENGTH],
  ['ProjectLabel.MaxNameLength', ETIQUETA, MAX_LABEL_NAME_LENGTH],
  ['ProjectReportType.MaxNameLength', TIPO, MAX_REPORT_TYPE_NAME_LENGTH],
  ['ProjectReportType.MaxActive', TIPO, MAX_ACTIVE_REPORT_TYPES],
  ['ProjectReportType.MaxQuestions', TIPO, MAX_REPORT_TYPE_QUESTIONS],
  ['ProjectReportType.MaxQuestionLength', TIPO, MAX_REPORT_TYPE_QUESTION_LENGTH],
  ['ProjectReportType.MaxTextBoxPromptLength', TIPO, MAX_TEXT_BOX_PROMPT_LENGTH],
  ['ProjectReportType.MaxAnswerLength', TIPO, MAX_REPORT_ANSWER_LENGTH],
  // Os textos da ferramenta: `LauncherLabel` -> `MaxLauncherLabelLength`.
  ...Object.entries(WIDGET_TEXT_LIMITS).map(([campo, limite]): [string, string, number] => [
    `ProjectWidgetSettings.Max${campo}Length`,
    FERRAMENTA,
    limite,
  ]),
  ['ProjectWidgetSettings.MinOffset', FERRAMENTA, WIDGET_APPEARANCE_LIMITS.MinOffset],
  ['ProjectWidgetSettings.MaxOffset', FERRAMENTA, WIDGET_APPEARANCE_LIMITS.MaxOffset],
  ['ProjectWidgetSettings.MaxHiddenPaths', FERRAMENTA, WIDGET_APPEARANCE_LIMITS.MaxHiddenPaths],
  [
    'ProjectWidgetSettings.MaxHiddenPathLength',
    FERRAMENTA,
    WIDGET_APPEARANCE_LIMITS.MaxHiddenPathLength,
  ],
  ['ProjectBlockedOrigin.MaxPerProject', BLOQUEADO, MAX_BLOCKED_ORIGINS],
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

describe('o teto da distancia do canto, na copia do carregador', () => {
  it('MAX_OFFSET vale o mesmo que ProjectWidgetSettings.MaxOffset', () => {
    // O carregador tem a copia dele do teto, porque nao importa os contratos do painel.
    expect(constante(FERRAMENTA, 'MaxOffset')).toBe(MAX_OFFSET)
  })
})

/**
 * As unioes que nao tem lista em tempo de execucao. O `Record<Uniao, true>` e a lista:
 * o `tsc` reprova se faltar ou sobrar um valor da uniao, e este teste compara as chaves
 * com o C#. As duas pontas ficam guardadas.
 */
const DESENHOS_DO_BOTAO: Record<WidgetLauncherIcon, true> = {
  None: true,
  Chat: true,
  Bug: true,
  Lightbulb: true,
  Question: true,
  Megaphone: true,
  Star: true,
}
const FORMATOS_DO_BOTAO: Record<WidgetLauncherShape, true> = {
  Pill: true,
  Rounded: true,
  Square: true,
}
const CELULAR: Record<WidgetMobileMode, true> = { Same: true, IconOnly: true, Hidden: true }
const MODELOS: Record<ProjectTemplate, true> = {
  SimpleBoard: true,
  Support: true,
  Kanban: true,
  Scrum: true,
}
const DOMINIO_OBSERVADO: Record<ObservedOriginStatus, true> = {
  Unlisted: true,
  Allowed: true,
  Blocked: true,
}

const ENUMS: ReadonlyArray<[string, readonly string[]]> = [
  ['ClosureTriggerEnum', ['LastColumn', 'Button']],
  ['SatisfactionStyleEnum', ['Stars', 'Number']],
  ['PublicOutcomeEnum', ['Done', 'WontDo', 'NoAnswer', 'Duplicate']],
  // O tipo virou tabela do projeto; o que continua lista fixa e o desenho dele.
  ['ReportTypeIconEnum', REPORT_TYPE_ICONS],
  ['WidgetPositionEnum', LAUNCHER_POSITIONS],
  ['WidgetLauncherSizeEnum', Object.keys(LAUNCHER_SIZES)],
  ['WidgetLauncherIconEnum', Object.keys(DESENHOS_DO_BOTAO)],
  ['WidgetLauncherShapeEnum', Object.keys(FORMATOS_DO_BOTAO)],
  ['WidgetMobileModeEnum', Object.keys(CELULAR)],
  ['ProjectTemplateEnum', Object.keys(MODELOS)],
  ['ObservedOriginStatusEnum', Object.keys(DOMINIO_OBSERVADO)],
  ['ReporterIdentityModeEnum', ['Protocol', 'PersonalCode', 'InheritedIdentity']],
  ['ReportVisibilityEnum', ['Private', 'PublicAnonymous', 'PublicIdentified']],
  ['ReportModerationStateEnum', ['Pending', 'Approved', 'Rejected']],
  ['SensitiveDataKindEnum', ['Cpf', 'Cnpj', 'CreditCard', 'Email', 'Phone', 'Token']],
  ['CardColorEnum', CARD_COLORS],
  ['ReportTitleModeEnum', ['Optional', 'Required', 'Hidden']],
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
