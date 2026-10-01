import { canvasToImageFile } from '@/capture/imageFile'
import type { EditDoc } from '@/editor/doc'
import { releaseScratch, renderEdit } from '@/editor/render'

/** A imagem aberta para desenhar, com o tamanho dela e o jeito de devolver a memoria. */
export interface OpenedImage {
  image: CanvasImageSource
  width: number
  height: number
  close(): void
}

/**
 * Abre o arquivo como imagem que o canvas desenha.
 *
 * `createImageBitmap` decodifica fora da tela e ja endireita a foto pela orientacao
 * que a camera gravou nela. Onde ele nao existe, a imagem comum faz o mesmo.
 */
export async function openImage(file: Blob): Promise<OpenedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const imagem = new Image()
    imagem.src = url
    await imagem.decode()
    return {
      image: imagem,
      width: imagem.naturalWidth,
      height: imagem.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    }
  } catch (falha) {
    URL.revokeObjectURL(url)
    throw falha
  }
}

/**
 * A imagem marcada, como arquivo — **desenhada de novo, pixel por pixel**. O que a
 * tarja cobriu nao existe nele, e os dados que a camera grava no arquivo (lugar,
 * aparelho) tambem nao vem junto.
 *
 * **No formato da imagem de origem**, com o nome dela: o PNG continua PNG, o JPEG
 * continua JPEG — ver `canvasToImageFile`, que tambem garante o teto.
 */
export async function exportEdit(
  opened: OpenedImage,
  doc: EditDoc,
  source: File,
  maxBytes: number | null,
): Promise<File> {
  const canvas = renderEdit(opened.image, opened, doc)
  try {
    return await canvasToImageFile(canvas, {
      maxBytes: maxBytes ?? undefined,
      format: source.type,
      name: source.name.replace(/\.[^.]*$/, '') || 'imagem',
    })
  } finally {
    // Ate 64 MB de canvas. O Safari do iPhone so devolve essa memoria com o canvas
    // zerado — e sem ela, a proxima tentativa ja nao ganha canvas.
    canvas.width = 0
    canvas.height = 0
    releaseScratch()
  }
}
