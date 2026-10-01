import {
  type AttachmentDisplaySize,
  type MediaKind,
  type PublicMediaKindViewModel,
  type PublicMediaSettingsViewModel,
  UPLOADABLE_MEDIA_KIND,
} from '@/contracts'
import type { EditDoc } from '@/editor/doc'
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
  /**
   * Endereco local da propria imagem, para mostrar no relato que a pessoa monta. Nulo
   * onde o navegador nao cria.
   *
   * **A imagem, e nao a miniatura.** Ela aparece no tamanho escolhido, ate a linha
   * inteira, e a miniatura de 320 pixels ficaria borrada ali — o que a pessoa ve
   * montando tem de ser o que o time vai ver.
   */
  preview: string | null
  /**
   * Em que tamanho a imagem aparece logo abaixo do texto. Escolha de quem relata, e
   * vai junto do arquivo — o relato mostra o que ela montou, do jeito que montou.
   */
  displaySize: AttachmentDisplaySize
  /**
   * A posicao na lista quando o envio comecou. **Fica guardada** para "Tentar de novo"
   * mandar a mesma: o arquivo tentado de novo chega depois dos outros, e a posicao e o
   * que o devolve ao lugar em que a pessoa o pos.
   */
  displayOrder?: number
  /** A miniatura que sobe junto. Nula quando o navegador nao soube gerar. */
  thumbnail: Blob | null
  /**
   * **Falhou e recusado sao estados diferentes.** Falhou e o que tentar de novo pode
   * resolver — rede, armazenamento fora. Recusado e o 409 da API: o envio fechou ou
   * encheu, a regra do projeto nao aceita, ou o arquivo nao serve — e repetir so
   * levaria a mesma resposta.
   */
  status: 'waiting' | 'sending' | 'done' | 'failed' | 'refused'
  progress: number
  error: string | null
  /**
   * A permissao cujo arquivo ja chegou ao armazenamento, e so falta confirmar.
   *
   * **E o que impede o mesmo print de entrar duas vezes.** A confirmacao pode ter
   * entrado e so a resposta dela se perdido; "Tentar de novo" confirma esta de novo,
   * e a API responde que ja entrou — em vez de recomecar e subir outro.
   */
  uploaded?: string | null
  /**
   * A imagem sem marcas e as marcas, quando a pessoa marcou no editor. **So para
   * reabrir o editor** com as marcas editaveis: o que sobe e sempre `file`, ja
   * desenhado, e a miniatura sai dele — o original, com o que a tarja cobriu, nunca
   * sai do navegador.
   */
  edit?: { original: File; doc: EditDoc } | null
}

/** Largura da miniatura. Cabe numa lista, e pesa poucos kilobytes. */
const THUMBNAIL_WIDTH = 320

/**
 * A altura maxima, em proporcao a largura. **Uma captura de rolagem longa** — 1080 por
 * 10000 — daria uma miniatura de 320 por 3000, que passa do teto da API; a miniatura
 * mostra o comeco dela, que e o que cabe numa lista.
 */
const THUMBNAIL_MAX_RATIO = 2

/** O teto da miniatura na API. Passando dele, o armazenamento recusa em silencio. */
const THUMBNAIL_MAX_BYTES = 256 * 1024

/**
 * Os tipos que a miniatura pode ter, em ordem — a API confere os bytes contra o tipo
 * declarado. WebP e o mais leve; JPEG e o de quem nao codifica WebP (o Safari).
 */
const THUMBNAIL_TYPES = ['image/webp', 'image/jpeg'] as const

/**
 * A configuracao com so o que ainda se pode enviar — hoje, so imagem.
 *
 * **A API ja nao lista video**, e isto nao e desconfianca dela: e o que segura a
 * janela da troca, quando o quadro novo pode falar com uma API que ainda nao
 * mudou. Sem isto, o seletor ofereceria video e o envio seria recusado depois de
 * a pessoa escolher o arquivo. O quadro e a pagina de acompanhamento passam por
 * aqui antes de decidir se mostram anexo.
 */
export function onlyUploadable(
  settings: PublicMediaSettingsViewModel,
): PublicMediaSettingsViewModel {
  return {
    ...settings,
    Kinds: settings.Kinds.filter((kind) => kind.Kind === UPLOADABLE_MEDIA_KIND),
  }
}

/**
 * O comeco de cada formato aceito — as mesmas marcas que a API confere na
 * confirmacao, com os bytes que chegaram ao armazenamento.
 */
const SIGNATURES: { type: string; matches: (b: Uint8Array) => boolean }[] = [
  {
    type: 'image/png',
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  { type: 'image/jpeg', matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    // RIFF....WEBP — os quatro bytes do meio sao o tamanho, e variam.
    type: 'image/webp',
    matches: (b) =>
      startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
      startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
]

function startsWith(bytes: Uint8Array, marca: number[]): boolean {
  return bytes.length >= marca.length && marca.every((byte, i) => bytes[i] === byte)
}

/**
 * O arquivo com o tipo que os bytes dizem, e nao o que a extensao diz.
 *
 * **O navegador deduz o tipo pela extensao, e a API confere pelos bytes.** A imagem
 * salva de um site que entrega WebP num endereco `.jpg`, ou o PNG renomeado, chegava
 * como JPEG, subia inteira, e era descartada na confirmacao — e "Tentar de novo"
 * repetia a mesma recusa para sempre, sobre uma imagem de um formato aceito.
 *
 * Bytes de nenhum formato conhecido deixam o arquivo como veio: a recusa, se houver,
 * e da API. Nao conseguir ler tambem.
 */
export async function withRealType(file: File): Promise<File> {
  let real: string | null = null

  try {
    const inicio = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    real = SIGNATURES.find((formato) => formato.matches(inicio))?.type ?? null
  } catch {
    return file
  }

  if (real === null || real === file.type) return file
  return new File([file], file.name, { type: real, lastModified: file.lastModified })
}

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
 *
 * **"Por envio", e nao "por relato".** O limite conta a criacao do relato e cada
 * resposta separadamente, e esta mesma mensagem aparece nos dois lugares.
 */
export function rejectReason(
  file: Blob,
  already: Pick<Anexo, 'kind'>[],
  settings: PublicMediaSettingsViewModel,
): string | null {
  const kind = kindFor(file, settings)

  if (!kind) return onlyAccepts(settings)

  // Antes do limite: "passa de 5 MB" dito de um arquivo vazio mandaria a pessoa
  // procurar um arquivo menor.
  if (file.size === 0) return 'O arquivo está vazio.'

  if (file.size > kind.MaxBytes) return `O arquivo passa de ${formatBytes(kind.MaxBytes)}.`

  if (already.length >= settings.MaxFilesPerReport)
    return fitsUpTo(settings.MaxFilesPerReport, 'arquivo', 'arquivos')

  if (already.filter((anexo) => anexo.kind === kind.Kind).length >= kind.MaxCount)
    return fitsUpTo(kind.MaxCount, 'imagem', 'imagens')

  return null
}

/**
 * Ainda cabe arquivo neste envio: de qualquer tipo aceito, ou so de `kind`.
 *
 * **Os dois limites, e nao so o total.** Com um tipo so, o de fabrica e quatro no
 * total e tres imagens — conferindo so o total, os botoes ficariam ligados depois
 * da terceira imagem, e a pessoa so ouviria "nao cabe" depois de capturar e
 * recortar a tela. E a mesma conta de `rejectReason`, feita antes do clique.
 */
export function hasRoom(
  already: Pick<Anexo, 'kind'>[],
  settings: PublicMediaSettingsViewModel,
  kind?: MediaKind,
): boolean {
  if (already.length >= settings.MaxFilesPerReport) return false

  return settings.Kinds.some(
    (tipo) =>
      (kind === undefined || tipo.Kind === kind) &&
      already.filter((anexo) => anexo.kind === tipo.Kind).length < tipo.MaxCount,
  )
}

/** Como o formato aparece para quem relata: a sigla, e nao o tipo MIME. */
const FORMAT_NAMES: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
}

/**
 * "Só dá para anexar imagem: PNG, JPEG ou WebP."
 *
 * **Diz o que serve, e nao so que aquele nao serve.** Quem mandava video antes
 * cola um e precisa saber o que fazer no lugar. Os formatos saem da configuracao,
 * que vem da API — escritos aqui, os dois lados divergiriam na primeira mudanca.
 */
function onlyAccepts(settings: PublicMediaSettingsViewModel): string {
  const formatos = settings.Kinds.flatMap((kind) => kind.ContentTypes).map(
    (tipo) => FORMAT_NAMES[tipo] ?? tipo.split('/').pop()?.toUpperCase() ?? tipo,
  )

  if (formatos.length === 0) return 'Esse formato de arquivo não é aceito aqui.'

  const lista =
    formatos.length === 1
      ? formatos[0]
      : `${formatos.slice(0, -1).join(', ')} ou ${formatos[formatos.length - 1]}`

  return `Só dá para anexar imagem: ${lista}.`
}

/**
 * "Cabe até 1 imagem por envio.", "Cabem até 2 imagens por envio."
 *
 * O verbo concorda com o numero, e nao so a palavra: um projeto que aceita um
 * arquivo por envio ve esta recusa no segundo.
 */
function fitsUpTo(count: number, singular: string, plural: string): string {
  return count === 1
    ? `Cabe até 1 ${singular} por envio.`
    : `Cabem até ${count} ${plural} por envio.`
}

export { formatBytes }

/**
 * A miniatura, feita **no proprio navegador**, antes de enviar.
 *
 * E o que deixa o painel mostrar uma lista sem baixar megabytes para desenhar 80
 * pixels, e sem o servidor precisar de biblioteca de imagem.
 *
 * **WebP, e JPEG onde o navegador nao codifica WebP.** Onde isso acontece — o
 * Safari, inclusive o do iPhone —, `toBlob` devolve PNG em silencio; so com WebP, quem
 * relata por la mandaria tudo sem miniatura, e o time veria so a palavra "imagem".
 *
 * **Devolve `null` em vez de falhar**, e isso e o combinado com a API: o anexo vale
 * sem miniatura.
 */
export async function makeThumbnail(file: File): Promise<Blob | null> {
  let canvas: HTMLCanvasElement | null = null
  let fonte: ImageBitmap | null = null
  try {
    fonte = await createImageBitmap(file)

    const largura = fonte.width
    const altura = fonte.height
    if (!largura || !altura) return null

    const escala = Math.min(1, THUMBNAIL_WIDTH / largura)
    canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(largura * escala))
    // A captura de rolagem longa mostra o comeco: ver `THUMBNAIL_MAX_RATIO`.
    canvas.height = Math.max(
      1,
      Math.min(Math.round(altura * escala), canvas.width * THUMBNAIL_MAX_RATIO),
    )

    const contexto = canvas.getContext('2d')
    if (!contexto) return null
    // Fundo branco por baixo: o JPEG nao tem transparencia, e o transparente sairia preto.
    contexto.fillStyle = 'white'
    contexto.fillRect(0, 0, canvas.width, canvas.height)
    contexto.drawImage(
      fonte,
      0,
      0,
      largura,
      canvas.height / escala,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    for (const tipo of THUMBNAIL_TYPES) {
      const alvo = canvas
      // Um degrau abaixo, se a primeira passar do teto da API — que a recusaria calada.
      for (const qualidade of [0.8, 0.6]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          alvo.toBlob(resolve, tipo, qualidade),
        )
        if (blob?.type !== tipo) break
        if (blob.size <= THUMBNAIL_MAX_BYTES) return blob
      }
    }
    return null
  } catch {
    return null
  } finally {
    // O bitmap e o canvas devolvem a memoria, mesmo quando o desenho falha no meio.
    fonte?.close()
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}

/**
 * Endereco local para mostrar a imagem, ou `null` onde o navegador nao cria — e o
 * caso do ambiente de teste, que nao tem `createObjectURL`.
 */
export function previewUrl(blob: Blob): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null
}

/** Devolve a memoria do endereco local. Sem isto, cada imagem ficaria presa ate fechar a pagina. */
export function releasePreview(url: string | null) {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}
