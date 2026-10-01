import {
  type MediaKind,
  type PublicMediaKindViewModel,
  type PublicMediaSettingsViewModel,
  UPLOADABLE_MEDIA_KIND,
} from '@/contracts'
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
  status: 'waiting' | 'sending' | 'done' | 'failed'
  progress: number
  error: string | null
}

/** Largura da miniatura. Cabe numa lista, e pesa poucos kilobytes. */
const THUMBNAIL_WIDTH = 320

/** O tipo que a miniatura precisa ter — a API confere pelos bytes. */
const THUMBNAIL_TYPE = 'image/webp'

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
 * **Devolve `null` em vez de falhar**, e isso e o combinado com a API: o anexo vale
 * sem miniatura. So nao pode ir uma miniatura que nao seja WebP — onde o navegador
 * nao codifica WebP, `toBlob` devolve PNG em silencio, e a API recusaria.
 */
export async function makeThumbnail(file: File): Promise<Blob | null> {
  try {
    const fonte = await createImageBitmap(file)

    const largura = fonte.width
    const altura = fonte.height
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
  }
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
