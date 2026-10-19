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

import type {
  PublicMediaSettingsViewModel,
  WidgetPosition,
  WidgetSettingsViewModel,
} from '@/contracts'

/** Carimbo em toda mensagem nossa, nos dois sentidos. */
export const MESSAGE_SOURCE = 'pds'

/** Da pagina para o quadro: quem e o projeto e de onde a pessoa esta relatando. */
export interface InitMessage {
  source: typeof MESSAGE_SOURCE
  type: 'init'
  key: string
  /** Ja sem o que vem depois de `?` e `#`: a pagina corta antes de mandar. */
  route: string | null
  /**
   * A origem da pagina, declarada por ela. Indicio, nunca prova — e o quadro prefere o
   * que o navegador diz: `location.ancestorOrigins`, e senao a origem carimbada na
   * propria mensagem (ver `configFromInit`). Este campo so vale quando nenhum dos dois
   * existe.
   */
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
  /**
   * O que este carregador sabe fazer alem de posicionar o quadro — hoje, capturar
   * uma area da pagina (`'capture'`).
   *
   * **O quadro so oferece o que o carregador declara.** Os dois saem juntos, mas o
   * navegador de quem visita pode ter guardado um carregador antigo: sem esta
   * lista, o botao novo pediria uma captura que ninguem do outro lado atende.
   */
  capabilities?: string[]
  /**
   * Quem desenha o botao parado na pagina. `'host'`: **o carregador** — o quadro so e
   * criado quando alguem pede para abrir, e ja nasce no formulario; fechar vira a
   * mensagem `close`, e o carregador mostra o botao dele de novo.
   *
   * Ausente, o quadro desenha o proprio botao, como sempre: o carregador antigo,
   * guardado no navegador de alguem, nao manda o campo e continua funcionando.
   */
  launcher?: typeof HOST_LAUNCHER
  /**
   * O cracha da pessoa, assinado pelo servidor do cliente — o `data-identity` do
   * script, so no projeto que herda a identidade. Nulo sem o atributo. **Opcional**: o
   * carregador antigo nao manda.
   */
  identity?: string | null
}

/** O carregador sabe capturar uma area da pagina. Ver `InitMessage.capabilities`. */
export const CAPTURE_CAPABILITY = 'capture'

/** O botao e do carregador. Ver `InitMessage.launcher`. */
export const HOST_LAUNCHER = 'host'

/**
 * Da pagina para o quadro: a pessoa pediu para abrir — pelo botao do carregador, por
 * `Pds.open()` ou por um elemento com `data-pds-open`. **So com o botao da pagina**
 * (`InitMessage.launcher`). Chega a cada abertura, e o quadro poe o foco no
 * formulario; da segunda em diante, le os tipos de novo, como o botao de dentro fazia.
 */
export interface OpenMessage {
  source: typeof MESSAGE_SOURCE
  type: 'open'
  /**
   * O caminho da pagina **agora**, ja sem `?` e `#`. O `init` leva o da primeira
   * pagina, e o quadro fica vivo enquanto o site troca de pagina sem recarregar: sem
   * este campo, o relato aberto depois de navegar diria a pagina errada. **Opcional**:
   * o carregador antigo nao manda, e o quadro fica com o do `init`.
   */
  route?: string | null
  /**
   * Falso, o quadro abre sem pegar o foco: a previa do painel que ja abre aberta, sem a
   * pessoa ter clicado, nao pode puxar o foco (e a rolagem) da tela para dentro dela.
   * **Opcional**: ausente, o foco vai ao formulario, como sempre.
   */
  focus?: boolean
  /**
   * O cracha **de agora**: o site pode ter renovado a sessao, e a pessoa pode ter
   * entrado ou saido sem recarregar. Nulo e "sem cracha"; ausente, fica o que ja havia.
   */
  identity?: string | null
}

/**
 * Do quadro para a pagina: a pessoa fechou o formulario (o "Fechar" ou o Esc). **So com
 * o botao da pagina.** O carregador esconde o quadro — e o guarda, para a proxima
 * abertura ser instantanea —, mostra o botao dele de novo e devolve o foco a ele.
 */
export interface CloseMessage {
  source: typeof MESSAGE_SOURCE
  type: 'close'
}

/**
 * Do quadro para a pagina: **nao ha o que abrir aqui** — a chave nao vale, o endereco
 * nao esta na lista, ou a ferramenta esta desligada. So com o botao da pagina: sem ele,
 * o quadro simplesmente nunca aparece; com ele, a pagina estava mostrando "abrindo" e
 * precisa saber que nao vai abrir.
 */
export interface UnavailableMessage {
  source: typeof MESSAGE_SOURCE
  type: 'unavailable'
}

/**
 * Do quadro para a pagina: a pessoa pediu para capturar uma area.
 *
 * **Quem captura e a pagina**, e nao o quadro: codigo dentro de um quadro de outra
 * origem nao alcanca a pagina onde esta. O carregador esconde o quadro, deixa a
 * pessoa marcar a area, redesenha e devolve o arquivo em `CaptureDoneMessage`.
 */
export interface CaptureRequestMessage {
  source: typeof MESSAGE_SOURCE
  type: 'capture'
  /** Quem pediu. A resposta volta com ele, e a que nao bate e ignorada. */
  id: string
  /** O teto de imagem do projeto, para o formato caber nele. */
  maxBytes: number | null
}

/**
 * Da pagina para o quadro: como terminou a captura pedida.
 *
 * `file` so vem com `outcome: 'file'`. Desistir (`'cancel'`) nao e erro. Falhar
 * (`'failed'`) e desta vez — a pagina nao deixou redesenhar, ou demorou demais — e
 * a proxima pode dar certo. **Indisponivel (`'unavailable'`) e para sempre nesta
 * pagina**: ela proibe o nosso script ou a nossa camada, e o quadro tira o botao.
 */
export interface CaptureDoneMessage {
  source: typeof MESSAGE_SOURCE
  type: 'capture-done'
  id: string
  outcome: 'file' | 'cancel' | 'failed' | 'unavailable'
  file: File | null
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
   * De que canto o quadro sai. Viaja em **toda** mensagem de tamanho, e nao uma vez
   * so: assim nenhum dos dois lados precisa guardar estado do outro, e uma mensagem
   * perdida nao deixa o quadro num canto e a pagina em outro.
   */
  position: WidgetPosition
  /**
   * A distancia do canto, em pixels, na horizontal e na vertical. Viaja junto pelo
   * mesmo motivo do canto. **Opcional**: o quadro antigo nao manda, e a pagina usa os
   * 20 de sempre.
   */
  offsetX?: number
  offsetY?: number
  /**
   * So no botao recolhido: o arredondamento do quadro, em pixels (999 e a pilula). O
   * aberto tem os cantos proprios. Ausente, a pilula de sempre.
   */
  radius?: number
  /** So no botao recolhido: a sombra que o cliente escolheu. Ausente, sem sombra. */
  shadow?: boolean
}

/**
 * Do painel para o quadro, **so na previa** (`embed.html?preview`): a configuracao
 * ainda nao publicada, para o quadro se desenhar com ela.
 *
 * **Mesma origem, e so ela.** O painel e o quadro saem do mesmo endereco; o quadro em
 * previa ignora qualquer mensagem que nao venha da janela de cima **e** da propria
 * origem — senao qualquer site poderia enquadra-lo e faze-lo mostrar o texto que
 * quisesse no nosso endereco. E a previa nunca envia nada.
 */
export interface PreviewMessage {
  source: typeof MESSAGE_SOURCE
  type: 'preview'
  settings: WidgetSettingsViewModel
  /** O tamanho da pagina de mentira: e ele que decide se o botao e o do celular. */
  viewport: { width: number; height: number }
  /**
   * Os anexos do rascunho, quando a previa e a da tela de Anexos. Sem eles, o formulario
   * aparece sem a area de anexar — e o que as outras telas mostram, porque nao leem anexo.
   */
  media?: PublicMediaSettingsViewModel | null
  /**
   * A parte do formulario que a tela do painel esta mudando agora, para o quadro
   * contorna-la — "e isto que voce esta mudando". **So na previa**, e so um dos nomes de
   * `PREVIEW_FORM_PARTS`: o que nao for um deles e descartado na chegada
   * (`connectToPreviewPanel`). Ausente ou nulo, nada se contorna.
   */
  highlight?: PreviewFormPart | null
}

/**
 * As partes do formulario que a previa sabe contornar, na ordem em que aparecem nele.
 * **Lista fechada**: a mensagem chega por `postMessage`, e so um destes nomes vira
 * contorno.
 */
export const PREVIEW_FORM_PARTS = [
  'form-top',
  'form-type',
  'form-title',
  'form-box',
  'form-attachments',
  'form-name',
  'form-submit',
] as const

/** Uma parte do formulario que a previa contorna. Ver `PREVIEW_FORM_PARTS`. */
export type PreviewFormPart = (typeof PREVIEW_FORM_PARTS)[number]

/** O valor que chegou de fora e um dos nomes de `PREVIEW_FORM_PARTS`. */
export function isPreviewFormPart(value: unknown): value is PreviewFormPart {
  return typeof value === 'string' && (PREVIEW_FORM_PARTS as readonly string[]).includes(value)
}

/** Do quadro em previa para o painel: estou ouvindo, pode mandar a configuracao. */
export interface PreviewReadyMessage {
  source: typeof MESSAGE_SOURCE
  type: 'preview-ready'
}

export type HostMessage = InitMessage | CaptureDoneMessage | OpenMessage
export type FrameMessage =
  | AckMessage
  | ResizeMessage
  | CaptureRequestMessage
  | PreviewReadyMessage
  | CloseMessage
  | UnavailableMessage

/** Os tamanhos do quadro. Ficam aqui porque as duas pontas precisam concordar. */
export const FRAME_SIZE = {
  /**
   * So o gatilho, parado no canto da pagina — o de sempre. **E o minimo do tamanho
   * medio**: a largura de verdade sai de `launcherFrame`, com o texto e o icone.
   */
  collapsed: { width: 160, height: 48 },
  /** O formulario aberto. */
  expanded: { width: 360, height: 520 },
  /**
   * O editor da imagem. **E pedido, e nao garantido**: o carregador limita a janela de
   * quem visita, entao numa tela pequena o quadro so cresce ate onde cabe — no
   * telefone, quase a tela toda. 360 por 520 nao e lugar para marcar um print.
   */
  editor: { width: 1200, height: 900 },
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
