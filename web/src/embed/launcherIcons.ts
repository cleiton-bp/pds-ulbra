import type { WidgetLauncherIcon } from '@/embed/launcher'

/**
 * OS DESENHOS DO BOTAO, SEM FRAMEWORK — so os tracos, como dados.
 *
 * **Tres lugares desenham o mesmo icone**: o carregador, que desenha o botao na pagina
 * do cliente sem React; o seletor do painel e o quadro, que desenham com React
 * (`shared/components/LauncherIcon.tsx`). Um desenho por lugar divergiria no primeiro
 * ajuste — e o carregador nao pode arrastar React para o site de ninguem. Daqui sai a
 * forma; cada um monta no seu documento.
 *
 * Traco simples e redondo, numa grade de 24 (`viewBox="0 0 24 24"`): o desenho chega
 * a 22 pixels, e a grade de 12 dos glifos dos tipos ficaria grossa demais.
 */

/** Uma peca do desenho: o nome da tag SVG e os atributos dela. */
export interface IconPart {
  tag: 'path' | 'rect' | 'circle'
  attrs: Record<string, string>
}

const path = (d: string): IconPart => ({ tag: 'path', attrs: { d } })

/** O balao de conversa — e o desenho de reserva. */
const CHAT: IconPart[] = [
  path(
    'M4.5 5.5A1.5 1.5 0 0 1 6 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 16h-8l-4.5 4v-4H6a1.5 1.5 0 0 1-1.5-1.5Z',
  ),
]

const ICONS: Record<Exclude<WidgetLauncherIcon, 'None'>, IconPart[]> = {
  Chat: CHAT,
  // O corpo, a cabeca e as tres patas de cada lado.
  Bug: [
    path('M9 7.5a3 3 0 0 1 6 0'),
    { tag: 'rect', attrs: { x: '7', y: '8', width: '10', height: '12', rx: '5' } },
    path('M12 12v8M3.5 13H7M17 13h3.5M4.5 19 7 17.2M19.5 19 17 17.2M4.5 7.5 7 9.3M19.5 7.5 17 9.3'),
  ],
  Lightbulb: [
    path(
      'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2v.5h5V16c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z',
    ),
  ],
  Question: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '9' } },
    path('M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.2 1-1.2 1.8v.3M12 17.2h.01'),
  ],
  // A boca larga para a direita, o cabo embaixo.
  Megaphone: [
    path(
      'M4 10v4a1 1 0 0 0 1 1h2l8 4V5L7 9H5a1 1 0 0 0-1 1ZM7 15l1.2 4.5h2.3L9.5 15M18.5 9.5a3.5 3.5 0 0 1 0 5',
    ),
  ],
  Star: [path('m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z')],
}

/**
 * As pecas do desenho. **O que esta versao nao conhece cai no balao**, em vez de
 * sumir: a API pode ganhar um desenho antes de o carregador guardado no navegador de
 * alguem ser atualizado.
 */
export function launcherIconParts(icon: WidgetLauncherIcon): IconPart[] {
  return ICONS[icon as Exclude<WidgetLauncherIcon, 'None'>] ?? CHAT
}

/** Os atributos do `svg` em volta, iguais nos tres lugares. */
export const ICON_SVG_ATTRS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * O desenho montado em DOM, para quem nao tem React — o carregador e a previa dele.
 * **Elemento a elemento, e nao por `innerHTML`**: pagina com Trusted Types recusa
 * `innerHTML`, e o botao nem apareceria. Decorativo: o nome vem do botao.
 */
export function createLauncherIcon(
  doc: Document,
  icon: WidgetLauncherIcon,
  size: number,
): SVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg')
  for (const [nome, valor] of Object.entries(ICON_SVG_ATTRS)) svg.setAttribute(nome, valor)
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  for (const parte of launcherIconParts(icon)) {
    const elemento = doc.createElementNS(SVG_NS, parte.tag)
    for (const [nome, valor] of Object.entries(parte.attrs)) elemento.setAttribute(nome, valor)
    svg.appendChild(elemento)
  }

  return svg
}
