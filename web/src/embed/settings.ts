import type { WidgetReportTypeViewModel, WidgetSettingsViewModel } from '@/contracts'

/**
 * O comeco do identificador dos tipos de fabrica **do proprio quadro**. Nao e um GUID,
 * e a API nunca o aceitaria: e o que separa o tipo que veio da leitura do que o quadro
 * desenhou sozinho porque a leitura falhou.
 */
export const FALLBACK_TYPE_PREFIX = 'fabrica:'

/** O tipo e um dos de fabrica do quadro, e nao um tipo de verdade do projeto. */
export function isFallbackType(typeId: string): boolean {
  return typeId.startsWith(FALLBACK_TYPE_PREFIX)
}

/**
 * Os tipos de fabrica — **e a segunda copia deles**, a de `ReportTypeDefaults.cs`,
 * pelo mesmo motivo dos textos abaixo: com a leitura falhando, o formulario ainda
 * precisa perguntar alguma coisa.
 *
 * **O identificador nao e de verdade**, e nao tem como ser: cada projeto tem os seus.
 * Enviar com ele exige achar antes o tipo de verdade — ver `findRealType`, em
 * `resolveSettings.ts`. As perguntas e os textos precisam continuar iguais aos do C#:
 * e por eles que o tipo de verdade e reconhecido.
 */
export const FALLBACK_REPORT_TYPES: WidgetReportTypeViewModel[] = [
  {
    PublicId: `${FALLBACK_TYPE_PREFIX}defeito`,
    Name: 'Defeito',
    Icon: 'Bug',
    Questions: [
      'O que você tentou fazer?',
      'O que aconteceu?',
      'O que você esperava que acontecesse?',
    ],
    ShowsTextBox: false,
    TextBoxPrompt: null,
  },
  {
    PublicId: `${FALLBACK_TYPE_PREFIX}melhoria`,
    Name: 'Melhoria',
    Icon: 'Improvement',
    Questions: [],
    ShowsTextBox: true,
    TextBoxPrompt: 'O que você gostaria que mudasse, e por quê?',
  },
  {
    PublicId: `${FALLBACK_TYPE_PREFIX}duvida`,
    Name: 'Dúvida',
    Icon: 'Question',
    Questions: [],
    ShowsTextBox: true,
    TextBoxPrompt: 'Qual é a sua dúvida?',
  },
]

/**
 * Os padroes da ferramenta — **e a segunda copia deles**.
 *
 * A primeira e `WidgetSettingsDefaults.cs`, que a API devolve para projeto que
 * nunca salvou nada. Esta existe porque o quadro precisa abrir mesmo quando a
 * leitura falha: uma ferramenta que nao aparece porque a rede caiu e pior do que
 * uma com os textos padrao.
 *
 * As duas listas precisam continuar iguais, e a divergencia so apareceria com a
 * API fora do ar — o pior momento para descobrir. Por isso ha um teste que le o
 * arquivo C# e compara campo a campo.
 */
export const DEFAULT_WIDGET_SETTINGS: WidgetSettingsViewModel = {
  IsEnabled: true,
  // Nulo e o acento do proprio produto, que acompanha o tema.
  AccentColor: null,
  Position: 'BottomRight',
  Theme: 'Auto',
  // A aparencia do botao, toda com o valor de antes de ela ser configuravel.
  OffsetX: 20,
  OffsetY: 20,
  LauncherIcon: 'None',
  LauncherIconOnly: false,
  LauncherSize: 'Medium',
  LauncherShape: 'Pill',
  // Nulo e automatico: a cor do texto sai da luminancia da cor do botao.
  LauncherTextColor: null,
  LauncherShadow: false,
  MobileMode: 'Same',
  HiddenPaths: [],
  LauncherLabel: 'Relatar',
  Title: 'Conte o que aconteceu',
  SuccessMessage: 'Recebemos. Anote o protocolo — é com ele que você acompanha.',
  SubmitLabel: 'Enviar',
  ReportTitleQuestion: 'Em poucas palavras, o que aconteceu?',
  ReportTitlePlaceholder: 'O botão de pagar não responde',
  TypeFieldLabel: 'O que é',
  MoreDetailsLabel: 'Mais detalhes',
  NameQuestion: 'Como podemos te chamar',
  PublicNotice:
    'Este relato pode virar público. Alguém da equipe lê antes; se for liberado, qualquer pessoa poderá ler o que você escrever aqui.',
  TrackingIntro: 'Este é o registro do que você enviou.',
  // **Este nao vem de `WidgetSettingsDefaults.cs`**: e o nome do projeto, que so
  // chega quando a confirmacao usa `{{projeto}}`. Sem a leitura, nao ha nome — e o
  // texto de fabrica nao usa a variavel.
  ProjectName: null,
  ShowsTypeField: true,
  // **Estes dois nao vem de `WidgetSettingsDefaults.cs`**: os tipos sao do projeto, e
  // os de fabrica moram em `ReportTypeDefaults.cs`. Nulo e o primeiro da lista, como
  // na gravacao.
  Types: FALLBACK_REPORT_TYPES,
  DefaultReportType: null,
  // A pergunta aparece e nao obriga: obrigar faria parte de quem relata desistir
  // antes de enviar.
  ReportTitleMode: 'Optional',
  // **Este nao vem de `WidgetSettingsDefaults.cs`**, e sim de
  // `CycleSettingsDefaults.cs`: ele decide o estado inicial de uma caixa do
  // formulario, mas a resposta dela pertence ao ciclo do relato. O teste de
  // divergencia le os tres arquivos.
  AcceptsQuestionsDefault: true,
  // **Nem deste**: vem de `IdentitySettingsDefaults.cs`. O modo decide se a
  // ferramenta guarda um codigo e oferece "os meus relatos" — e com a API fora do
  // ar o seguro e o modo que nao promete lista nenhuma.
  IdentityMode: 'Protocol',
  // **Tambem de `IdentitySettingsDefaults.cs`.** Com a API fora do ar o seguro e
  // o nivel mais fechado: um quadro que avisasse "isto sera publico" por engano
  // assustaria sem motivo, e um que deixasse de avisar seria pior — a pessoa
  // escreveria sem saber.
  Visibility: 'Private',
  AsksForName: false,
  // **Tambem de `IdentitySettingsDefaults.cs`.** So vale no modo que herda a
  // identidade; com a API fora do ar, nao se recusa relato de ninguem.
  IdentityRequired: false,
}
