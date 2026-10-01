import { snapdom } from '@zumer/snapdom'
import type { CaptureArea } from '@/capture/area'
import { canvasToImageFile } from '@/capture/imageFile'

/**
 * O que nunca entra no print: o nosso quadro e a camada de marcar a area. Sao
 * nossos, e estao por cima do que a pessoa quer mostrar.
 */
export const EXCLUDED_FROM_CAPTURE = ['iframe[data-pds]', '[data-pds-captura]']

/**
 * A densidade maxima do print. **Duas vezes, e nao a da tela.** Duas e o que deixa
 * o texto nitido num monitor comum ampliado; tres, de alguns celulares, dobraria o
 * arquivo sem ninguem ler melhor.
 */
const MAX_SCALE = 2

/**
 * Desenha uma area da pagina como imagem — **pela pagina, e nao pela tela**.
 *
 * **Sem o navegador perguntar nada.** A pagina e redesenhada a partir do que ela
 * tem — os elementos, os estilos, as imagens —, e nao lida da tela. E isso que
 * funciona em qualquer navegador, inclusive no iPhone, que nao deixa capturar a
 * tela.
 *
 * **O que a pagina nao deixa ler sai em branco.** Imagem de outro site sem
 * permissao de leitura e quadro de outro site — um video, um pagamento — nao se
 * redesenham. O resto da area sai como a pessoa ve.
 *
 * **Nada e escondido aqui.** O que a pessoa nao quer mostrar ela esconde depois,
 * na imagem, antes de anexar.
 *
 * @param area A area marcada, em pixels da janela.
 * @param maxBytes O teto de imagem do projeto. Ver `canvasToImageFile`.
 */
export async function capturePage(area: CaptureArea, maxBytes: number | null): Promise<File> {
  // **Do `<html>`, e nao do `<body>`.** Ha site em que quem rola e o proprio
  // `<body>` (`html { overflow: hidden }`, `body { overflow: auto }`): desenhado a
  // partir dele, a rolagem dele se perdia, e o print saia do topo da pagina — e nao
  // do que a pessoa marcou.
  const captura = await snapdom(document.documentElement, {
    // A area, em coordenadas da pagina: a janela mais a rolagem. So ela e
    // redesenhada — o que esta fora e descartado antes, e uma pagina longa nao
    // custa mais que uma curta.
    clip:
      area === 'viewport'
        ? 'viewport'
        : {
            x: Math.round(area.x + window.scrollX),
            y: Math.round(area.y + window.scrollY),
            width: Math.max(1, Math.round(area.width)),
            height: Math.max(1, Math.round(area.height)),
          },
    exclude: EXCLUDED_FROM_CAPTURE,
    // Removidos, e nao escondidos: sao fixos, e tira-los nao muda nada em volta.
    excludeMode: 'remove',
    backgroundColor: pageBackground(),
    dpr: Math.min(window.devicePixelRatio || 1, MAX_SCALE),
    embedFonts: true,
  })

  // O formato mais leve, cabendo no teto: ver `canvasToImageFile`.
  const canvas = await captura.toCanvas()
  try {
    return await canvasToImageFile(canvas, { maxBytes: maxBytes ?? undefined })
  } finally {
    // Na pagina do cliente, e ate 2880x1800: o Safari so devolve a memoria zerado.
    canvas.width = 0
    canvas.height = 0
  }
}

/**
 * A cor de fundo que a pagina mostra. **Sem ela, o print sai transparente** onde o
 * site pinta o fundo no `<html>` e nao no `<body>` — e parece corrompido para quem
 * le o relato.
 */
export function pageBackground(): string {
  for (const elemento of [document.body, document.documentElement]) {
    const cor = getComputedStyle(elemento).backgroundColor
    if (cor && cor !== 'transparent' && cor !== 'rgba(0, 0, 0, 0)') return cor
  }

  return '#ffffff'
}
