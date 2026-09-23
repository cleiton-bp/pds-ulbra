import type { MediaKind, PublicMediaKindViewModel, PublicMediaSettingsViewModel } from '@/contracts'
import { formatBytes } from '@/shared/lib/formatBytes'

/**
 * Um arquivo escolhido, antes e depois de enviar.
 *
 * **Antes de enviar ele so existe aqui.** Escolher e remover mexem nesta lista e
 * em nada mais — nenhum byte sobe enquanto a pessoa escreve. O envio comeca so
 * depois de o relato existir, e e isso que faz uma falha no arquivo nunca levar o
 * texto junto.
 */
export interface Anexo {
  /** Identidade local, so para a lista. Nao e o identificador da API. */
  id: string
  file: File
  kind: MediaKind
  /** Endereco local da miniatura, para mostrar. Nulo onde o navegador nao cria. */
  preview: string | null
  /** A miniatura que sobe junto. Nula quando o navegador nao soube gerar. */
  thumbnail: Blob | null
  durationSeconds: number | null
  status: 'waiting' | 'sending' | 'done' | 'failed'
  progress: number
  error: string | null
}

/**
 * Quanto se espera o navegador responder sobre um video, antes de desistir.
 *
 * **Sem prazo, um video que o navegador nao sabe decodificar nunca avisa nada** —
 * nem que carregou, nem que falhou — e o anexo ficaria esperando para sempre na
 * lista. Com prazo, a miniatura so nao sai, e o anexo segue sem ela.
 */
const VIDEO_TIMEOUT_MS = 4000

/** Largura da miniatura. Cabe numa lista, e pesa poucos kilobytes. */
const THUMBNAIL_WIDTH = 320

/** O tipo que a miniatura precisa ter — a API confere pelos bytes. */
const THUMBNAIL_TYPE = 'image/webp'

/** A categoria que aceita este arquivo, pelo tipo dele. */
export function kindFor(
  file: Blob,
  settings: PublicMediaSettingsViewModel,
): PublicMediaKindViewModel | null {
  return settings.Kinds.find((kind) => kind.ContentTypes.includes(file.type)) ?? null
}

/** O que vai no `accept` do seletor, para o navegador ja esconder o que nao serve. */
export function acceptAttribute(settings: PublicMediaSettingsViewModel): string {
  return settings.Kinds.flatMap((kind) => kind.ContentTypes).join(',')
}

/**
 * Por que este arquivo nao pode entrar, ou `null` se pode.
 *
 * **Confere aqui para a recusa chegar cedo, e nao porque aqui seja a trava.** Quem
 * trava e o servidor, que confere tudo de novo, e o armazenamento, que recusa o
 * que passa do teto assinado. Isto so evita que a pessoa escolha um arquivo, espere
 * o envio, e so entao ouca "nao serve".
 */
export function rejectReason(
  file: Blob,
  already: Pick<Anexo, 'kind'>[],
  settings: PublicMediaSettingsViewModel,
): string | null {
  const kind = kindFor(file, settings)

  if (!kind) return 'Esse formato de arquivo não é aceito aqui.'

  if (file.size > kind.MaxBytes) return `O arquivo passa de ${formatBytes(kind.MaxBytes)}.`

  if (already.length >= settings.MaxFilesPerReport)
    return `Cabem até ${settings.MaxFilesPerReport} arquivos por relato.`

  if (already.filter((anexo) => anexo.kind === kind.Kind).length >= kind.MaxCount)
    return kind.Kind === 'Video'
      ? `Cabem até ${kind.MaxCount} vídeo${kind.MaxCount > 1 ? 's' : ''} por relato.`
      : `Cabem até ${kind.MaxCount} imagens por relato.`

  return null
}

export { formatBytes }

/**
 * A miniatura, feita **no proprio navegador**, antes de enviar.
 *
 * E o que deixa o painel mostrar uma lista sem baixar megabytes para desenhar 80
 * pixels, e sem o servidor precisar de biblioteca de imagem. No video e o quadro
 * de capa.
 *
 * **Devolve `null` em vez de falhar**, e isso e o combinado com a API: o anexo vale
 * sem miniatura. So nao pode ir uma miniatura que nao seja WebP — onde o navegador
 * nao codifica WebP, `toBlob` devolve PNG em silencio, e a API recusaria.
 */
export async function makeThumbnail(file: File, kind: MediaKind): Promise<Blob | null> {
  let liberar = () => {}

  try {
    let fonte: ImageBitmap | HTMLVideoElement | null

    if (kind === 'Video') {
      const quadro = await videoFrame(file)
      fonte = quadro?.video ?? null
      liberar = () => releasePreview(quadro?.url ?? null)
    } else {
      fonte = await createImageBitmap(file)
    }

    if (!fonte) return null

    const largura = fonte instanceof HTMLVideoElement ? fonte.videoWidth : fonte.width
    const altura = fonte instanceof HTMLVideoElement ? fonte.videoHeight : fonte.height
    if (!largura || !altura) return null

    const escala = Math.min(1, THUMBNAIL_WIDTH / largura)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(largura * escala))
    canvas.height = Math.max(1, Math.round(altura * escala))

    const contexto = canvas.getContext('2d')
    if (!contexto) return null
    contexto.drawImage(fonte, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, THUMBNAIL_TYPE, 0.8),
    )

    return blob?.type === THUMBNAIL_TYPE ? blob : null
  } catch {
    return null
  } finally {
    // O quadro ja foi desenhado: o endereco local do video pode ir embora.
    liberar()
  }
}

/**
 * Quantos segundos tem o video, ou `null` se o navegador nao soube dizer.
 *
 * **O `Infinity` e esperado, e tem remedio.** Video gravado pelo proprio navegador
 * sai sem duracao no cabecalho, e ela so aparece depois de pedir para ir muito
 * alem do fim — o navegador percorre o arquivo e descobre onde ele acaba.
 */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let terminou = false
    const fim = (valor: number | null) => {
      if (terminou) return
      terminou = true
      clearTimeout(prazo)
      URL.revokeObjectURL(url)
      resolve(valor)
    }
    const prazo = setTimeout(() => fim(null), VIDEO_TIMEOUT_MS)

    video.preload = 'metadata'
    video.muted = true
    video.onerror = () => fim(null)
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        fim(Math.max(1, Math.ceil(video.duration)))
        return
      }

      video.ontimeupdate = () => {
        video.ontimeupdate = null
        fim(Number.isFinite(video.duration) ? Math.max(1, Math.ceil(video.duration)) : null)
      }
      video.currentTime = Number.MAX_SAFE_INTEGER
    }
    video.src = url
  })
}

/**
 * Um quadro do comeco do video, para ser a capa — e o endereco local, que quem
 * chama libera depois de desenhar.
 */
function videoFrame(file: File): Promise<{ video: HTMLVideoElement; url: string } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let terminou = false
    const falhou = () => {
      if (terminou) return
      terminou = true
      clearTimeout(prazo)
      releasePreview(url)
      resolve(null)
    }
    const prazo = setTimeout(falhou, VIDEO_TIMEOUT_MS)

    video.preload = 'auto'
    video.muted = true
    video.onerror = falhou
    // Um pouco depois do zero: o primeiro quadro de muita gravacao e preto.
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, Number.isFinite(video.duration) ? video.duration : 0.5)
    }
    video.onseeked = () => {
      if (terminou) return
      terminou = true
      clearTimeout(prazo)
      resolve({ video, url })
    }
    video.src = url
  })
}

/**
 * Endereco local para mostrar a miniatura, ou `null` onde o navegador nao cria
 * — e o caso do ambiente de teste, que nao tem `createObjectURL`.
 */
export function previewUrl(blob: Blob): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null
}

/** Devolve a memoria do endereco local. Sem isto, cada miniatura ficaria presa ate fechar a pagina. */
export function releasePreview(url: string | null) {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}
