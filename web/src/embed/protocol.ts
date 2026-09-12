/**
 * O combinado entre a pagina hospedeira e o quadro.
 *
 * Os dois lados moram em origens diferentes e so conversam por `postMessage`, que
 * e um canal **aberto**: qualquer script da pagina, qualquer outro quadro e
 * qualquer aba que tenha referencia a janela pode mandar mensagem. Por isso todo
 * campo daqui existe para ser conferido, e nenhum para ser confiado.
 *
 * As tres conferencias, iguais nas duas pontas:
 *
 * 1. `event.origin` e a origem que se espera — no quadro, a que veio no primeiro
 *    `init`; no carregador, a origem de onde ele proprio foi servido;
 * 2. `event.source` e a janela certa — `window.parent` de um lado,
 *    `iframe.contentWindow` do outro. E esta que impede outro quadro da **mesma**
 *    origem de se passar pelo nosso;
 * 3. `source === 'pds'`, que separa o que e nosso do resto do barulho da pagina.
 *
 * Nenhuma resposta sai para `'*'`. Mandar para `'*'` entrega o conteudo a
 * qualquer pagina que tenha enquadrado o quadro.
 */

import type { WidgetPosition } from '@/contracts'

/** Carimbo em toda mensagem nossa, nos dois sentidos. */
export const MESSAGE_SOURCE = 'pds'

/** Da pagina para o quadro: quem e o projeto e de onde a pessoa esta relatando. */
export interface InitMessage {
  source: typeof MESSAGE_SOURCE
  type: 'init'
  key: string
  /** Ja sem o que vem depois de `?` e `#`: a pagina corta antes de mandar. */
  route: string | null
  /** A origem da pagina, declarada por ela. Indicio, nunca prova. */
  origin: string | null
  /**
   * O tamanho da janela **da pagina**, que o quadro nao tem como medir sozinho:
   * dentro do `iframe`, `innerWidth` e a largura do proprio quadro.
   *
   * Serve para reproduzir o problema — "so quebra em tela estreita" e a metade da
   * informacao que mais falta num relato. Como todo o resto que chega por aqui, e
   * declarado pela pagina e conferido de novo do lado de ca.
   */
  viewport: { width: number; height: number } | null
}

/** Do quadro para a pagina: recebi o `init` e ja posso ser mostrado. */
export interface AckMessage {
  source: typeof MESSAGE_SOURCE
  type: 'ack'
}

/**
 * Do quadro para a pagina: de que tamanho eu preciso agora, e em que canto.
 *
 * O quadro nao consegue mudar o proprio `iframe` — ele esta do lado de fora, no
 * documento da pagina. Entao ele pede, e o carregador aplica.
 *
 * <b>O primeiro `resize` e tambem o sinal de que o quadro esta pronto.</b> O
 * `iframe` nasce invisivel e so aparece quando ele chega, e o quadro so o manda
 * depois de ter a configuracao do cliente em maos. Uma regra, quatro coisas
 * resolvidas: o canto certo desde o inicio; a ferramenta desligada, que
 * simplesmente nunca manda e nunca aparece; o rotulo que nao pisca, porque nada e
 * desenhado com os padroes para ser trocado depois; e o quadro que nao carregou,
 * que some em vez de deixar uma pilula vazia no canto do site.
 */
export interface ResizeMessage {
  source: typeof MESSAGE_SOURCE
  type: 'resize'
  width: number
  height: number
  /**
   * De que canto inferior o quadro sai. Viaja em **toda** mensagem de tamanho, e
   * nao uma vez so: assim nenhum dos dois lados precisa guardar estado do outro,
   * e uma mensagem perdida nao deixa o quadro num canto e a pagina em outro.
   */
  position: WidgetPosition
}

export type HostMessage = InitMessage
export type FrameMessage = AckMessage | ResizeMessage

/** Os tamanhos do quadro. Ficam aqui porque as duas pontas precisam concordar. */
export const FRAME_SIZE = {
  /** So o gatilho, parado no canto da pagina. */
  collapsed: { width: 160, height: 48 },
  /** O formulario aberto. */
  expanded: { width: 360, height: 520 },
} as const

/**
 * Um `unknown` vindo do `postMessage` so vira mensagem nossa depois disto. O
 * `data` chega de fora e pode ser qualquer coisa, inclusive `null`.
 */
export function isOurMessage(data: unknown): data is { source: string; type: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === MESSAGE_SOURCE &&
    typeof (data as { type?: unknown }).type === 'string'
  )
}
