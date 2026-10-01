/**
 * A imagem desenhada vira arquivo, no formato que cabe.
 *
 * **WebP quando o navegador codifica.** E o que faz um print de tela inteira caber
 * no limite sem perder a leitura do texto.
 *
 * **Sem WebP, PNG — se couber.** O Safari nao codifica WebP, e o PNG de uma tela
 * Retina passa facil de 5 MB: a pessoa marcaria a area para so entao ouvir que nao
 * cabe. Passando de `maxBytes`, vai JPEG, que cabe e ainda se le. Os tres sao
 * aceitos pela API.
 *
 * @param maxBytes O teto de imagem do projeto. Sem ele, o PNG vai como sair.
 */
export async function canvasToImageFile(
  canvas: HTMLCanvasElement,
  maxBytes: number = Number.POSITIVE_INFINITY,
): Promise<File> {
  const codificar = (tipo: string, qualidade?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, qualidade))

  const webp = await codificar('image/webp', 0.9)
  if (webp?.type === 'image/webp') return new File([webp], 'captura.webp', { type: 'image/webp' })

  // O navegador que nao codifica WebP devolve PNG no lugar, e esse ja serve.
  const png = webp?.type === 'image/png' ? webp : await codificar('image/png')
  if (png && png.size <= maxBytes) return new File([png], 'captura.png', { type: 'image/png' })

  const jpeg = await codificar('image/jpeg', 0.9)
  if (jpeg?.type === 'image/jpeg') return new File([jpeg], 'captura.jpg', { type: 'image/jpeg' })

  // Nem JPEG: o PNG grande ainda e melhor que nada, e a recusa diz o limite.
  if (png) return new File([png], 'captura.png', { type: 'image/png' })

  throw new Error('Não deu para gerar a imagem da captura.')
}
