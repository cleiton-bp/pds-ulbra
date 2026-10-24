import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDGET_SETTINGS, isFallbackType } from '@/embed/settings'

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
 * **O segundo arquivo, e por que sao dois.**
 *
 * `AcceptsQuestionsDefault` decide o estado inicial de uma caixa do formulario,
 * mas a resposta dela pertence ao ciclo do relato — entao o valor mora nas regras
 * do ciclo, e nao nas da ferramenta. A resposta da API junta os dois porque ela e
 * "tudo que o quadro precisa para aparecer".
 *
 * Ler so o primeiro arquivo faria este teste **reprovar o campo novo como se ele
 * estivesse sobrando** — e a saida facil seria tirar o campo da lista, que e
 * justamente perder a guarda.
 */
const CSHARP_CICLO = fileURLToPath(
  new URL(
    '../../../api/Pds.Domain/Entities/ProjectCycleSettings/CycleSettingsDefaults.cs',
    import.meta.url,
  ),
)

/** Os campos do ciclo que a ferramenta le. Um hoje; a lista diz qual. */
const DO_CICLO = ['AcceptsQuestionsDefault'] as const

/**
 * **O terceiro arquivo.** `IdentityMode` decide se a ferramenta guarda um codigo e
 * oferece "os meus relatos" — e o valor mora nas regras de identidade, que e onde
 * ele significa alguma coisa. A resposta da API junta os tres porque ela e "tudo
 * que o quadro precisa para aparecer".
 */
const CSHARP_IDENTIDADE = fileURLToPath(
  new URL(
    '../../../api/Pds.Domain/Entities/ProjectIdentitySettings/IdentitySettingsDefaults.cs',
    import.meta.url,
  ),
)

/** O campo da identidade que a ferramenta le, e o nome que ele tem la. */
const DA_IDENTIDADE = [
  ['IdentityMode', 'Mode'],
  ['Visibility', 'Visibility'],
  ['AsksForName', 'AsksForName'],
  ['IdentityRequired', 'IdentityRequired'],
] as const

/**
 * Le `public const <tipo> <Nome> = <valor>;`, inclusive quando o valor cai para a
 * linha de baixo — e o caso dos dois textos longos.
 */
function parseDefaults(source: string): Record<string, unknown> {
  const found: Record<string, unknown> = {}

  // O texto entre aspas vem inteiro: o aviso de relato publico tem ponto e virgula.
  for (const match of source.matchAll(/public const \S+\?? (\w+)\s*=\s*("[^"]*"|[^;]+);/g)) {
    const name = match[1] ?? ''
    const raw = (match[2] ?? '').trim()

    found[name] = readValue(raw)
  }

  // Lista nao cabe em `const`: sai como `public static IReadOnlyList<string> X => [];`.
  // So a lista vazia e lida — uma lista com itens aqui teria de ser lida de verdade,
  // e o teste reprova ate alguem ensinar como.
  for (const match of source.matchAll(
    /public static IReadOnlyList<\w+> (\w+)\s*=>\s*\[([^\]]*)\];/g,
  )) {
    const name = match[1] ?? ''
    const itens = (match[2] ?? '').trim()

    found[name] = itens === '' ? [] : `lista com itens: ${itens}`
  }

  return found
}

/**
 * **O quarto arquivo: os tipos de fabrica.** Com a leitura falhando, o formulario
 * ainda pergunta com eles — e e pelas perguntas e textos que o tipo de verdade e
 * reconhecido na hora de enviar. Le cada `new("Nome", Icone, Cor, [perguntas],
 * ShowsTextBox: x, TextBoxPrompt: y)` na ordem do arquivo.
 */
const CSHARP_TIPOS = fileURLToPath(
  new URL(
    '../../../api/Pds.Domain/Entities/ProjectReportType/ReportTypeDefaults.cs',
    import.meta.url,
  ),
)

function parseReportTypes(source: string) {
  const padrao =
    /new\("([^"]+)",\s*ReportTypeIconEnum\.(\w+),\s*CardColorEnum\.\w+,\s*\[([^\]]*)\],\s*ShowsTextBox:\s*(true|false),\s*TextBoxPrompt:\s*(null|"[^"]*")\)/g

  return [...source.matchAll(padrao)].map((match) => ({
    Name: match[1],
    Icon: match[2],
    Questions: [...(match[3] ?? '').matchAll(/"([^"]*)"/g)].map((pergunta) => pergunta[1]),
    ShowsTextBox: match[4] === 'true',
    TextBoxPrompt: readValue(match[5] ?? ''),
  }))
}

/**
 * Os campos que nao sao padrao de nada: vem do projeto. `ProjectName` so sai quando
 * algum texto usa `{{projeto}}` — e nenhum texto de fabrica usa, entao a API tambem
 * manda nulo. `DefaultReportType` nulo e "o primeiro da lista". `Types` tem o arquivo
 * proprio, acima.
 */
const DO_PROJETO = ['ProjectName', 'DefaultReportType', 'Types'] as const

function readValue(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null

  // Numero: a distancia do botao ao canto. Sem isto o 20 do C# viraria o texto '20'.
  if (/^-?\d+$/.test(raw)) return Number(raw)

  // Texto: pode estar quebrado em varias linhas, mas e sempre um literal so.
  if (raw.startsWith('"')) return raw.slice(1, raw.lastIndexOf('"'))

  // `WidgetPositionEnum.BottomRight` vira `BottomRight`, que e como o JSON sai.
  return raw.slice(raw.lastIndexOf('.') + 1)
}

describe('os padroes da ferramenta, dos dois lados', () => {
  const daFerramenta = parseDefaults(readFileSync(CSHARP, 'utf8'))
  const doCiclo = parseDefaults(readFileSync(CSHARP_CICLO, 'utf8'))
  const daIdentidade = parseDefaults(readFileSync(CSHARP_IDENTIDADE, 'utf8'))

  // Do arquivo do ciclo entra **so** o que a ferramenta le. As outras doze regras
  // de la nao aparecem no quadro, e arrasta-las para ca faria este teste cobrar do
  // TypeScript campos que ele nao tem por que conhecer.
  const csharp: Record<string, unknown> = { ...daFerramenta }
  for (const campo of DO_CICLO) csharp[campo] = doCiclo[campo]
  for (const [aqui, la] of DA_IDENTIDADE) csharp[aqui] = daIdentidade[la]

  it('os tres arquivos C# ainda cobrem os campos do quadro — se pararam, o resto deste teste nao vale', () => {
    expect([...Object.keys(csharp), ...DO_PROJETO].sort()).toEqual(
      Object.keys(DEFAULT_WIDGET_SETTINGS).sort(),
    )
  })

  it('os tipos de fabrica sao os mesmos no C# e no TypeScript, na mesma ordem', () => {
    const tipos = parseReportTypes(readFileSync(CSHARP_TIPOS, 'utf8'))

    // Sem isto, mudar a forma do `new(...)` faria o teste comparar lista vazia com
    // lista vazia — e o quadro nunca tem lista vazia.
    expect(tipos.length).toBeGreaterThan(0)
    expect(DEFAULT_WIDGET_SETTINGS.Types.map(({ PublicId: _, ...resto }) => resto)).toEqual(tipos)
  })

  it('os tipos de fabrica do quadro se dizem de fabrica, e a API nunca os aceitaria', () => {
    for (const tipo of DEFAULT_WIDGET_SETTINGS.Types) {
      expect(isFallbackType(tipo.PublicId)).toBe(true)
    }
  })

  it('o nome do projeto e o pre-marcado sao nulos, como a API manda sem nada configurado', () => {
    const textos = Object.values(DEFAULT_WIDGET_SETTINGS).filter((v) => typeof v === 'string')

    // Nulo so vale porque nenhum texto de fabrica pede o nome do projeto.
    expect(textos.some((texto) => texto.includes('{{projeto}}'))).toBe(false)
    expect(DEFAULT_WIDGET_SETTINGS.ProjectName).toBeNull()
    expect(DEFAULT_WIDGET_SETTINGS.DefaultReportType).toBeNull()
  })

  it('o campo do ciclo foi mesmo encontrado, e nao virou `undefined` em silencio', () => {
    // Sem isto, renomear a constante em C# faria o teste abaixo comparar
    // `undefined` com `undefined` e passar — que e o jeito mais silencioso de
    // perder uma guarda.
    for (const campo of DO_CICLO) expect(doCiclo).toHaveProperty(campo)
    for (const [, la] of DA_IDENTIDADE) expect(daIdentidade).toHaveProperty(la)
  })

  for (const [campo, valor] of Object.entries(DEFAULT_WIDGET_SETTINGS)) {
    if ((DO_PROJETO as readonly string[]).includes(campo)) continue

    it(`${campo} e o mesmo no C# e no TypeScript`, () => {
      expect(csharp[campo]).toEqual(valor)
    })
  }
})
