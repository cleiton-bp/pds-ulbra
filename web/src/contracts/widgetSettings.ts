import type { ReporterIdentityMode } from '@/contracts/identitySettings'

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

import type { ReportType } from '@/contracts/report'

/** De que canto inferior a ferramenta sai, e para que lado o quadro abre. */
export type WidgetPosition = 'BottomRight' | 'BottomLeft'

/** `Auto` segue o `prefers-color-scheme` de quem visita o site do cliente. */
export type WidgetTheme = 'Auto' | 'Light' | 'Dark'

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

  /** O texto dentro do gatilho, o botao que fica parado na pagina. */
  LauncherLabel: string

  /** O titulo dentro do quadro. Nunca o nome do projeto: aquele e nome interno. */
  Title: string

  /** O texto cinza da caixa vazia. E ele que faz a pergunta certa. */
  Placeholder: string

  /** A frase acima do protocolo, na confirmacao. */
  SuccessMessage: string

  /** Mostra ou esconde o seletor de tipo. */
  ShowsTypeField: boolean

  /**
   * Qual opcao vem pre-marcada quando o seletor aparece — e qual tipo e enviado
   * quando ele esta escondido.
   */
  DefaultReportType: ReportType

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
}

/** Limites das colunas de texto, iguais aos que a API vai declarar. */
export const WIDGET_TEXT_LIMITS = {
  LauncherLabel: 40,
  Title: 60,
  Placeholder: 160,
  SuccessMessage: 200,
} as const
