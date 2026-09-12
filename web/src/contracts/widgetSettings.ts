/**
 * A configuracao da ferramenta de relato, por projeto.
 *
 * **Ainda nao existe do lado da API.** A tabela `project_widget_settings`, as
 * rotas e a tela que as edita sao o pds-014; aqui esta a forma acordada, e e ela
 * que o formulario ja le hoje — de `embed/settings.ts`, que carrega os padroes.
 * Quando a rota nascer, muda de onde o objeto vem, e nao o que ele e.
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
}

/** Limites das colunas de texto, iguais aos que a API vai declarar. */
export const WIDGET_TEXT_LIMITS = {
  LauncherLabel: 40,
  Title: 60,
  Placeholder: 160,
  SuccessMessage: 200,
} as const
