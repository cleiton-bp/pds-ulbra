import type {
  WidgetLauncherIcon,
  WidgetLauncherShape,
  WidgetLauncherSize,
  WidgetLauncherViewModel,
  WidgetMobileMode,
  WidgetPosition,
  WidgetSettingsViewModel,
  WidgetTheme,
} from '@/contracts'
import { FRAME_SIZE, MESSAGE_SOURCE, type ResizeMessage } from '@/embed/protocol'

// Os tipos do contrato, repassados: o carregador nao importa de `@/contracts` (a regra
// de arquitetura o proibe), e precisa deles para desenhar o botao. Sumem no build.
export type {
  WidgetLauncherIcon,
  WidgetLauncherShape,
  WidgetLauncherSize,
  WidgetLauncherViewModel,
  WidgetMobileMode,
  WidgetPosition,
  WidgetTheme,
}

/**
 * O BOTAO PARADO NO SITE DO CLIENTE — o tamanho, os cantos, onde ele fica e quando
 * ele aparece.
 *
 * **Sem React e sem dependencia nenhuma, de proposito.** Tres lugares precisam das
 * mesmas contas: o carregador, que desenha o botao na pagina do cliente e posiciona o
 * `iframe` quando ele abre; a previa do painel, que desenha o mesmo botao numa pagina
 * de mentira; e o quadro aberto direto, sem pagina. Uma conta por lugar divergiria no
 * primeiro ajuste — e o carregador nao pode arrastar React para o site de ninguem.
 *
 * Quem monta o botao em DOM e `loader/launcherView.ts`; aqui ficam as contas e as
 * regras (paginas escondidas, celular), que nao dependem de documento nenhum.
 */

/** Os quatro cantos, para conferir o que chega por mensagem. */
export const LAUNCHER_POSITIONS: readonly WidgetPosition[] = [
  'BottomRight',
  'BottomLeft',
  'TopRight',
  'TopLeft',
]

/** A distancia do canto de sempre, e a que vale quando a mensagem nao traz uma. */
export const DEFAULT_OFFSET = 20

/** O teto da distancia do canto — o mesmo de `ProjectWidgetSettings.MaxOffset`. */
export const MAX_OFFSET = 200

/**
 * Abaixo desta largura, a janela e de celular. **E a janela da pagina, e nao o
 * aparelho**: um computador com a janela estreita tem o mesmo problema de espaco, e
 * um tablet deitado nao tem.
 */
export const NARROW_VIEWPORT = 640

/**
 * O anel em volta do botao, dentro do quadro recolhido: o `p-1` de sempre. O quadro
 * tem o fundo do tema, e o anel e o que separa o botao de um site da mesma cor.
 */
export const LAUNCHER_RING = 4

/**
 * O quadro recolhido nunca passa disto. **Precisa ficar abaixo da largura do
 * formulario aberto**: e pela largura que o carregador sabe se o quadro esta aberto,
 * e o carregador antigo — guardado no navegador de alguem — continua sabendo assim.
 */
export const LAUNCHER_MAX_WIDTH = 320

/**
 * As medidas de cada tamanho, em pixels. **O medio e o botao de sempre**: 40 de
 * altura, 16 de margem, e o quadro com no minimo 160 de largura. As margens precisam
 * bater com as classes do botao em `EmbedApp` (`px-3`, `px-4`, `px-5`): a largura do
 * quadro e calculada com elas.
 */
export const LAUNCHER_SIZES: Record<
  WidgetLauncherSize,
  { button: number; minWidth: number; paddingX: number; icon: number; gap: number }
> = {
  Small: { button: 32, minWidth: 128, paddingX: 12, icon: 16, gap: 6 },
  Medium: { button: 40, minWidth: 160, paddingX: 16, icon: 18, gap: 8 },
  Large: { button: 48, minWidth: 192, paddingX: 20, icon: 22, gap: 10 },
}

/** As medidas do tamanho, com o medio para o valor que esta versao nao conhece. */
export function launcherSize(size: WidgetLauncherSize) {
  return LAUNCHER_SIZES[size] ?? LAUNCHER_SIZES.Medium
}

/**
 * O arredondamento do quadro e o do botao dentro dele. **O de dentro e o de fora
 * menos o anel**, senao o anel fica mais grosso nos cantos. A pilula e 999: qualquer
 * altura vira meia-lua, e com so o icone, circulo.
 */
export function launcherRadius(shape: WidgetLauncherShape): { frame: number; button: number } {
  switch (shape) {
    case 'Rounded':
      return { frame: 12, button: 8 }
    case 'Square':
      return { frame: 0, button: 0 }
    default:
      return { frame: 999, button: 999 }
  }
}

/** A janela e de celular? Sem medida, nao: o padrao e o botao do computador. */
export function isNarrowViewport(width: number | null | undefined): boolean {
  return typeof width === 'number' && Number.isFinite(width) && width > 0 && width < NARROW_VIEWPORT
}

/**
 * O caminho sem os `%XX`: o navegador da `/promo%C3%A7%C3%A3o`, e a lista foi escrita
 * `/promoção`. Um `%` solto nao decodifica — ai vale como veio.
 */
function decoded(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/**
 * O caminho como ele e comparado: sem diferenca de maiuscula e sem a barra do fim —
 * `/Checkout/` e `/checkout` sao a mesma pagina para quem escreveu a lista.
 */
function comparable(path: string): string {
  const lower = path.trim().toLowerCase()
  return lower.length > 1 ? lower.replace(/\/+$/, '') || '/' : lower
}

/**
 * O caminho casa com um item da lista?
 *
 * - `/checkout` — so essa pagina (com ou sem a barra do fim);
 * - `/login/*` — `/login` e tudo embaixo dele (`/login/senha`);
 * - `/ajuda*` — tudo o que comeca assim (`/ajuda`, `/ajuda-rapida`).
 *
 * O `*` so vale no fim, e a API recusa a lista com ele em outro lugar.
 */
export function matchesPagePattern(pattern: string, path: string): boolean {
  const regra = decoded(pattern.trim()).toLowerCase()
  if (!regra.startsWith('/')) return false

  // Os dois lados decodificados, uma vez so: a regra pode ter sido escrita de um jeito
  // ou de outro, e o caminho vem do navegador com `%XX`.
  const caminho = comparable(decoded(path))

  if (!regra.endsWith('*')) return comparable(regra) === caminho

  const comeco = regra.slice(0, -1)
  // `/login/*` vale para `/login` tambem: a area de login comeca nela.
  if (comeco.length > 1 && comeco.endsWith('/') && caminho === comeco.slice(0, -1)) return true

  return caminho.startsWith(comeco)
}

/**
 * O botao fica escondido nesta pagina? **E a regra que o carregador segue a cada
 * navegacao** — por isso mora aqui, sem dependencia nenhuma. Sem caminho (o quadro
 * aberto direto), nada se esconde.
 */
export function isHiddenPage(
  patterns: readonly string[] | null | undefined,
  route: string | null | undefined,
): boolean {
  if (!route || !Array.isArray(patterns) || patterns.length === 0) return false
  return patterns.some(
    (pattern) => typeof pattern === 'string' && matchesPagePattern(pattern, route),
  )
}

/** O que a aparencia precisa saber da configuracao. */
export type LauncherSettings = Pick<
  WidgetSettingsViewModel,
  | 'Position'
  | 'OffsetX'
  | 'OffsetY'
  | 'LauncherIcon'
  | 'LauncherIconOnly'
  | 'LauncherSize'
  | 'LauncherShape'
  | 'LauncherShadow'
  | 'MobileMode'
  | 'HiddenPaths'
>

/**
 * Como o botao aparece nesta pagina: escondido, so o icone, ou com o texto.
 *
 * **Sem icone nao ha botao so de icone.** A API recusa essa combinacao; se um dia ela
 * chegar assim mesmo, o quadro mostra o texto — botao vazio no canto nao diz o que faz.
 */
export function launcherMode(
  settings: LauncherSettings,
  route: string | null,
  viewportWidth: number | null | undefined,
): 'hidden' | 'icon' | 'full' {
  if (isHiddenPage(settings.HiddenPaths, route)) return 'hidden'

  const celular = isNarrowViewport(viewportWidth)
  if (celular && settings.MobileMode === 'Hidden') return 'hidden'

  const querIcone = settings.LauncherIconOnly || (celular && settings.MobileMode === 'IconOnly')

  return querIcone && settings.LauncherIcon !== 'None' ? 'icon' : 'full'
}

/** A geometria do quadro recolhido: o que o `resize` do botao leva. */
export type LauncherFrame = Required<Omit<ResizeMessage, 'source' | 'type'>>

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * O tamanho do quadro recolhido para este botao.
 *
 * **A largura acompanha o texto**, medido pelo quadro (`labelWidth`), e nunca fica
 * abaixo da de sempre: o "Relatar" de fabrica continua num quadro de 160, e um texto
 * de 40 letras deixa de quebrar em duas linhas dentro dele. So o icone, e quadrado.
 */
export function launcherFrame(
  settings: LauncherSettings,
  mode: 'icon' | 'full',
  labelWidth: number,
): LauncherFrame {
  const medidas = launcherSize(settings.LauncherSize)
  const height = medidas.button + LAUNCHER_RING * 2
  const comIcone = settings.LauncherIcon !== 'None'

  const width =
    mode === 'icon'
      ? height
      : clamp(
          Math.ceil(
            medidas.paddingX * 2 +
              (comIcone ? medidas.icon + medidas.gap : 0) +
              Math.max(0, labelWidth) +
              LAUNCHER_RING * 2,
          ),
          medidas.minWidth,
          LAUNCHER_MAX_WIDTH,
        )

  return {
    width,
    height,
    position: settings.Position,
    offsetX: clamp(settings.OffsetX, 0, MAX_OFFSET),
    offsetY: clamp(settings.OffsetY, 0, MAX_OFFSET),
    radius: launcherRadius(settings.LauncherShape).frame,
    shadow: settings.LauncherShadow,
  }
}

/**
 * Um `resize` vindo do `postMessage` so e aplicado depois disto: o que chega de fora
 * pode ser qualquer coisa. O canto desconhecido cai no de sempre; a distancia, no
 * intervalo; o tamanho que nao e numero recusa a mensagem inteira.
 *
 * **Os campos novos sao opcionais**: o quadro antigo, guardado no navegador de alguem,
 * manda so tamanho e canto — e continua no lugar de sempre.
 */
export function readResize(data: unknown): ResizeMessage | null {
  const pedido = data as Partial<ResizeMessage> | null
  if (pedido?.type !== 'resize') return null

  const { width, height } = pedido
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return null

  const distancia = (valor: unknown) =>
    typeof valor === 'number' && Number.isFinite(valor)
      ? clamp(valor, 0, MAX_OFFSET)
      : DEFAULT_OFFSET

  return {
    source: MESSAGE_SOURCE,
    type: 'resize',
    width,
    height,
    position: LAUNCHER_POSITIONS.includes(pedido.position as WidgetPosition)
      ? (pedido.position as WidgetPosition)
      : 'BottomRight',
    offsetX: distancia(pedido.offsetX),
    offsetY: distancia(pedido.offsetY),
    radius:
      typeof pedido.radius === 'number' && Number.isFinite(pedido.radius)
        ? clamp(pedido.radius, 0, 999)
        : 999,
    shadow: pedido.shadow === true,
  }
}

const ICONES: readonly WidgetLauncherIcon[] = [
  'None',
  'Chat',
  'Bug',
  'Lightbulb',
  'Question',
  'Megaphone',
  'Star',
]

/** Um valor da lista, ou o de sempre: o que esta versao nao conhece nao derruba o botao. */
function umDe<T extends string>(valor: unknown, lista: readonly T[], padrao: T): T {
  return lista.includes(valor as T) ? (valor as T) : padrao
}

/**
 * A resposta de `GET public/widget-launcher` so vira aparencia depois disto. **Sem
 * `IsEnabled` booleano e sem texto, nao ha botao** — devolve nulo, e o carregador nao
 * desenha nada, como na recusa: adivinhar um botao poderia coloca-lo onde o cliente
 * nao quer. O resto que vier fora do combinado cai no de fabrica, campo a campo.
 */
export function readLauncherAppearance(data: unknown): WidgetLauncherViewModel | null {
  const lido = data as Partial<WidgetLauncherViewModel> | null
  if (typeof lido !== 'object' || lido === null) return null
  if (typeof lido.IsEnabled !== 'boolean' || typeof lido.LauncherLabel !== 'string') return null

  const numero = (valor: unknown) =>
    typeof valor === 'number' && Number.isFinite(valor)
      ? clamp(valor, 0, MAX_OFFSET)
      : DEFAULT_OFFSET
  const cor = (valor: unknown) => (typeof valor === 'string' ? valor : null)

  return {
    IsEnabled: lido.IsEnabled,
    AccentColor: cor(lido.AccentColor),
    Position: umDe(lido.Position, LAUNCHER_POSITIONS, 'BottomRight'),
    Theme: umDe<WidgetTheme>(lido.Theme, ['Auto', 'Light', 'Dark'], 'Auto'),
    FormBackgroundColor: cor(lido.FormBackgroundColor),
    OffsetX: numero(lido.OffsetX),
    OffsetY: numero(lido.OffsetY),
    LauncherIcon: umDe(lido.LauncherIcon, ICONES, 'None'),
    LauncherIconOnly: lido.LauncherIconOnly === true,
    LauncherSize: umDe<WidgetLauncherSize>(
      lido.LauncherSize,
      ['Small', 'Medium', 'Large'],
      'Medium',
    ),
    LauncherShape: umDe<WidgetLauncherShape>(
      lido.LauncherShape,
      ['Pill', 'Rounded', 'Square'],
      'Pill',
    ),
    LauncherTextColor: cor(lido.LauncherTextColor),
    LauncherShadow: lido.LauncherShadow === true,
    MobileMode: umDe<WidgetMobileMode>(lido.MobileMode, ['Same', 'IconOnly', 'Hidden'], 'Same'),
    HiddenPaths: Array.isArray(lido.HiddenPaths)
      ? lido.HiddenPaths.filter((item): item is string => typeof item === 'string')
      : [],
    LauncherLabel: lido.LauncherLabel,
  }
}

/** A distancia minima que o quadro aberto deixa ate a borda da janela. */
const GUTTER = 20

/**
 * Onde e de que tamanho o quadro fica, numa janela deste tamanho. **O carregador
 * aplica isto ao `iframe` na pagina do cliente, e a previa do painel ao `iframe` da
 * pagina de mentira** — a mesma conta nos dois.
 *
 * - O tamanho pedido e o desejado, nao o obtido: a janela pode ser menor que ele, e
 *   o quadro transbordaria o topo numa tela baixa (visto numa janela de 513px).
 * - A distancia do canto vale ate onde a janela deixar: o quadro nunca sai dela.
 * - A sombra so diz qual: quem aplica escreve a cor, cada um no seu documento.
 */
export function placeFrame(
  message: ResizeMessage,
  viewport: { width: number; height: number },
): {
  width: number
  height: number
  top: number | null
  bottom: number | null
  left: number | null
  right: number | null
  radius: number
  shadow: 'open' | 'launcher' | 'none'
} {
  const aberto = message.width >= FRAME_SIZE.expanded.width
  const width = Math.max(0, Math.min(message.width, viewport.width - GUTTER * 2))
  const height = Math.max(0, Math.min(message.height, viewport.height - GUTTER * 2))

  const x = clamp(message.offsetX ?? DEFAULT_OFFSET, 0, Math.max(0, viewport.width - width))
  const y = clamp(message.offsetY ?? DEFAULT_OFFSET, 0, Math.max(0, viewport.height - height))

  const esquerda = message.position === 'BottomLeft' || message.position === 'TopLeft'
  const emCima = message.position === 'TopRight' || message.position === 'TopLeft'

  return {
    width,
    height,
    top: emCima ? y : null,
    bottom: emCima ? null : y,
    left: esquerda ? x : null,
    right: esquerda ? null : x,
    // O formulario aberto tem cantos e sombra proprios; o botao, os que o cliente escolheu.
    radius: aberto ? 14 : (message.radius ?? 999),
    shadow: aberto ? 'open' : message.shadow ? 'launcher' : 'none',
  }
}
