import type { ReporterIdentityMode, ReportVisibility } from '@/contracts/identitySettings'

/**
 * A configuracao da ferramenta de relato, por projeto.
 *
 * **Esta forma atravessa o sistema inteiro**, e e o motivo de ela viver aqui: a
 * tabela `project_widget_settings` a guarda, duas rotas do painel a leem e a
 * gravam, uma rota publica a entrega ao quadro, e o formulario a consome. Projeto
 * que nunca salvou nada recebe os padroes de `embed/settings.ts` na mesma forma —
 * quem le nao distingue os dois casos, e nao deve.
 *
 * Escrito em `contracts/` de proposito: e a unica pasta em que
 * `architecture.test.ts` obriga PascalCase, e um campo que vira `camelCase` no
 * caminho le uma chave que o JSON nao tem e entrega `undefined` sem erro nenhum.
 */

import type { ReportTypeIcon } from '@/contracts/report'

/**
 * De que canto a ferramenta sai, e para que lado o quadro abre. Os de cima nunca sao o
 * padrao — disputam com cabecalho fixo e aviso de cookie —, mas e o cliente quem
 * conhece o proprio site.
 */
export type WidgetPosition = 'BottomRight' | 'BottomLeft' | 'TopRight' | 'TopLeft'

/** O desenho dentro do botao. `None` e so o texto, como sempre foi. */
export type WidgetLauncherIcon =
  | 'None'
  | 'Chat'
  | 'Bug'
  | 'Lightbulb'
  | 'Question'
  | 'Megaphone'
  | 'Star'

/** O tamanho do botao. `Medium` e o de sempre. */
export type WidgetLauncherSize = 'Small' | 'Medium' | 'Large'

/** O arredondamento do botao. `Pill` e o de sempre; com so o icone, vira circulo. */
export type WidgetLauncherShape = 'Pill' | 'Rounded' | 'Square'

/** Como o botao fica numa janela estreita: igual, so o icone, ou escondido. */
export type WidgetMobileMode = 'Same' | 'IconOnly' | 'Hidden'

/** `Auto` segue o `prefers-color-scheme` de quem visita o site do cliente. */
export type WidgetTheme = 'Auto' | 'Light' | 'Dark'

/**
 * So o que o botao parado no site do cliente precisa — a resposta de
 * `GET public/widget-launcher`, que o carregador le em toda visita. **Os mesmos campos,
 * com o mesmo nome, da configuracao inteira**: o carregador e o quadro desenham com a
 * mesma conta, e a previa do painel passa a configuracao inteira no lugar desta.
 */
export type WidgetLauncherViewModel = Pick<
  WidgetSettingsViewModel,
  | 'IsEnabled'
  | 'AccentColor'
  | 'Position'
  | 'Theme'
  | 'OffsetX'
  | 'OffsetY'
  | 'LauncherIcon'
  | 'LauncherIconOnly'
  | 'LauncherSize'
  | 'LauncherShape'
  | 'LauncherTextColor'
  | 'LauncherShadow'
  | 'MobileMode'
  | 'HiddenPaths'
  | 'LauncherLabel'
>

/**
 * Como a ferramenta pergunta o titulo — "em poucas palavras, o que aconteceu?".
 * Obrigatoria, a ferramenta nao envia sem resposta, e a API recusa.
 */
export type ReportTitleMode = 'Optional' | 'Required' | 'Hidden'

export interface WidgetSettingsViewModel {
  /**
   * Desliga a ferramenta no site inteiro sem ninguem tocar no script colado. E a
   * unica opcao sem substituto: hoje a alternativa seria pedir ao time do cliente
   * que editasse o HTML.
   */
  IsEnabled: boolean

  /**
   * Cor do gatilho e do botao de enviar, em `#rrggbb`. **Nulo** significa usar o
   * acento do proprio produto, que acompanha o tema — e o padrao, porque quase
   * preto combina com site desconhecido e azul saturado briga.
   *
   * A cor do texto por cima nao se escolhe: e derivada da luminancia da cor
   * escolhida, senao a primeira pessoa a escolher amarelo perde o rotulo.
   */
  AccentColor: string | null

  Position: WidgetPosition
  Theme: WidgetTheme

  /** A distancia do canto ate o botao, na horizontal, em pixels (0 a 200). */
  OffsetX: number
  /** A distancia do canto ate o botao, na vertical, em pixels (0 a 200). */
  OffsetY: number
  /** O desenho dentro do botao. */
  LauncherIcon: WidgetLauncherIcon
  /**
   * So o icone, sem o texto. O texto nao some: vira a dica e o nome que o leitor de
   * tela le. A API recusa sem icone escolhido.
   */
  LauncherIconOnly: boolean
  LauncherSize: WidgetLauncherSize
  LauncherShape: WidgetLauncherShape
  /**
   * A cor do texto e do icone sobre o botao, em `#rrggbb`. **Nulo e automatico**: a de
   * maior contraste com a cor do botao, como sempre foi.
   */
  LauncherTextColor: string | null
  /** Sombra embaixo do botao parado na pagina. */
  LauncherShadow: boolean
  /** Como o botao fica numa janela estreita. `IconOnly` exige um icone. */
  MobileMode: WidgetMobileMode
  /**
   * As paginas onde o botao nao aparece: caminho exato (`/checkout`) ou comeco
   * terminado em `*` (`/login/*`). Quem compara e `isHiddenPage`, em `embed/launcher.ts`.
   */
  HiddenPaths: string[]

  /** O texto dentro do gatilho, o botao que fica parado na pagina. */
  LauncherLabel: string

  /** O titulo dentro do quadro. Nunca o nome do projeto: aquele e nome interno. */
  Title: string

  /**
   * A frase acima do protocolo, na confirmacao, **com as variaveis como foram
   * escritas**: o quadro troca depois de enviar, com `renderWidgetText`.
   */
  SuccessMessage: string

  /** O texto do botao que envia. */
  SubmitLabel: string
  /** A pergunta do titulo. */
  ReportTitleQuestion: string
  /** O exemplo cinza dentro da linha do titulo. */
  ReportTitlePlaceholder: string
  /** O nome do seletor de tipo. */
  TypeFieldLabel: string
  /** O nome da caixa livre, quando ela vem depois das perguntas. */
  MoreDetailsLabel: string
  /** A pergunta do nome. */
  NameQuestion: string
  /**
   * O aviso de que o relato pode virar publico. A frase sobre o nome, que vem
   * depois, continua fixa: ela depende da visibilidade.
   */
  PublicNotice: string
  /**
   * A frase do topo do acompanhamento. Vem aqui para o painel editar; a pagina a
   * recebe na leitura do relato.
   */
  TrackingIntro: string
  /**
   * O nome do projeto, para `{{projeto}}`. **Nulo no site do cliente quando a
   * confirmacao nao usa a variavel**: e nome interno, e so viaja quando o proprio
   * projeto o escreveu.
   */
  ProjectName: string | null

  /** Mostra ou esconde o seletor de tipo. */
  ShowsTypeField: boolean

  /**
   * Os tipos que a ferramenta oferece: os **ativos**, na ordem do projeto, cada um
   * com o jeito de perguntar. Moram em outra tabela, e vem aqui porque as perguntas
   * de cada tipo sao o proprio formulario.
   */
  Types: WidgetReportTypeViewModel[]

  /**
   * O `PublicId` do tipo pre-marcado quando o seletor aparece — e do tipo enviado
   * quando ele esta escondido.
   *
   * **Sempre um dos `Types` na leitura**: sem escolha, ou com o escolhido desativado,
   * a API devolve o primeiro ativo. Na gravacao, **nulo e um valor**: o primeiro
   * ativo, qualquer que ele seja depois de reordenar.
   */
  DefaultReportType: string | null

  /** Como a ferramenta pergunta o titulo: opcional (o padrao), obrigatoria ou escondida. */
  ReportTitleMode: ReportTitleMode

  /**
   * Como a caixa "aceito responder duvidas" vem marcada no formulario.
   *
   * **Vem de outra tabela na API**, e isso e deliberado: o valor mora nas regras
   * do ciclo, porque e la que a resposta significa alguma coisa — e quem precisa
   * dele para **desenhar** e a ferramenta. Esta resposta e "tudo que o quadro
   * precisa para aparecer".
   *
   * **O padrao nao e a resposta.** Ele so decide o estado inicial da caixa; a
   * escolha final e de quem escreve o relato.
   */
  AcceptsQuestionsDefault: boolean
  /**
   * Como quem relata e reconhecido neste projeto.
   *
   * **A ferramenta precisa saber, e o cliente nao configura isso nela.** E o modo
   * que decide se ela guarda um codigo e oferece "os meus relatos", ou se cada
   * relato sai como um link solto.
   */
  IdentityMode: ReporterIdentityMode
  /**
   * Quem pode ver os relatos deste projeto.
   *
   * **A ferramenta le isto para avisar antes de a pessoa escrever.** Avisar
   * depois seria avisar tarde.
   */
  Visibility: ReportVisibility
  /** A ferramenta pergunta o nome. Opcional sempre, e interno por padrao. */
  AsksForName: boolean
  /**
   * So no modo que herda a identidade: sem o cracha do site, o relato e recusado — e a
   * ferramenta pede para entrar no sistema **antes** de a pessoa escrever. Falso nos
   * outros modos e de fabrica: o relato sem cracha entra como protocolo.
   */
  IdentityRequired: boolean
}

/**
 * Um tipo de relato como a ferramenta o desenha: o botao e o formulario dele.
 *
 * **Sem a cor.** A ferramenta se pinta com o acento do cliente, e uma cor por botao
 * brigaria com ele; a cor do tipo e do painel, onde separa os cards.
 */
export interface WidgetReportTypeViewModel {
  /**
   * O identificador que o envio manda de volta (`TypeId`). **Nao e um GUID so nos
   * tipos de fabrica do proprio quadro** (`embed/settings.ts`), desenhados quando a
   * leitura falhou: ai nao ha identificador de verdade, e o envio precisa achar um.
   */
  PublicId: string
  Name: string
  Icon: ReportTypeIcon
  /** As perguntas curtas, na ordem: cada uma vira um campo, e a resposta volta na mesma ordem. */
  Questions: string[]
  /** A caixa livre aparece, depois das perguntas. */
  ShowsTextBox: boolean
  /** O texto cinza dentro da caixa livre. Nulo quando ela nao aparece. */
  TextBoxPrompt: string | null
}

/**
 * A configuracao como o painel a grava: todos os campos, sempre juntos.
 *
 * **Substitui, e nao altera campo a campo** — `AccentColor`, `LauncherTextColor` e
 * `DefaultReportType` nulos sao valores (o acento do produto, a cor do texto
 * automatica, o primeiro tipo ativo), e num corpo parcial
 * seriam indistinguiveis de "nao mexa". Os tipos nao vao: sao configurados na tela
 * Tipos de relato.
 */
export interface SaveWidgetSettingsRequest {
  IsEnabled: boolean
  AccentColor: string | null
  Position: WidgetPosition
  Theme: WidgetTheme
  OffsetX: number
  OffsetY: number
  LauncherIcon: WidgetLauncherIcon
  LauncherIconOnly: boolean
  LauncherSize: WidgetLauncherSize
  LauncherShape: WidgetLauncherShape
  LauncherTextColor: string | null
  LauncherShadow: boolean
  MobileMode: WidgetMobileMode
  HiddenPaths: string[]
  LauncherLabel: string
  Title: string
  SuccessMessage: string
  SubmitLabel: string
  ReportTitleQuestion: string
  ReportTitlePlaceholder: string
  TypeFieldLabel: string
  MoreDetailsLabel: string
  NameQuestion: string
  PublicNotice: string
  TrackingIntro: string
  ShowsTypeField: boolean
  DefaultReportType: string | null
  ReportTitleMode: ReportTitleMode
}

/** Limites das colunas de texto, iguais aos que a API vai declarar. */
export const WIDGET_TEXT_LIMITS = {
  LauncherLabel: 40,
  Title: 60,
  SuccessMessage: 200,
  SubmitLabel: 30,
  ReportTitleQuestion: 80,
  ReportTitlePlaceholder: 80,
  TypeFieldLabel: 40,
  MoreDetailsLabel: 40,
  NameQuestion: 80,
  PublicNotice: 300,
  TrackingIntro: 300,
} as const

/** Os textos da ferramenta — todos obrigatorios, cada um com o seu teto. */
export type WidgetTextField = keyof typeof WIDGET_TEXT_LIMITS

/** Os limites da aparencia, iguais aos de `ProjectWidgetSettings.cs`. */
export const WIDGET_APPEARANCE_LIMITS = {
  /** A distancia do canto, em pixels, nos dois eixos. */
  MinOffset: 0,
  MaxOffset: 200,
  /** Quantas paginas podem esconder o botao, e o tamanho de cada caminho. */
  MaxHiddenPaths: 20,
  MaxHiddenPathLength: 200,
} as const
