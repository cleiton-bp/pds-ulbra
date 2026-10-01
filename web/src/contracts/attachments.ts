/** Espelho de `Pds.Domain/Dtos/ReportAttachmentDtos.cs` e `ViewModels/ReportAttachmentViewModels.cs`. */

import type { MediaKind } from '@/contracts/mediaSettings'

/**
 * Em que tamanho a imagem aparece logo abaixo do texto: um terco da linha, meia, tres
 * quartos ou a linha inteira.
 *
 * **Fracao da largura do texto, e nao pixels.** O relato e montado no quadro, que e
 * estreito, e lido no painel e no acompanhamento, que sao mais largos: com a fracao,
 * a imagem que ocupava meia linha ocupa meia linha em todo lugar.
 */
export type AttachmentDisplaySize = 'Small' | 'Medium' | 'Large' | 'Full'

/** Os tamanhos, do menor para o maior — a ordem dos botoes. */
export const ATTACHMENT_DISPLAY_SIZES: readonly AttachmentDisplaySize[] = [
  'Small',
  'Medium',
  'Large',
  'Full',
]

/**
 * O tamanho de quem nao escolheu — o mesmo padrao da API. **A linha inteira**: o print
 * legivel sem precisar abrir; diminuir e escolha de quem relata.
 */
export const DEFAULT_ATTACHMENT_DISPLAY_SIZE: AttachmentDisplaySize = 'Full'

/**
 * Um formulario assinado, pronto para o navegador enviar.
 *
 * **Nao e um endereco solto, e a diferenca e o teto de tamanho.** Os campos
 * carregam as regras assinadas, e o armazenamento recusa o que nao couber antes
 * de gravar. Mexer em qualquer campo invalida a assinatura.
 */
export interface SignedUploadViewModel {
  Url: string
  /** Vao todos, antes do arquivo — o armazenamento exige o arquivo por ultimo. */
  Fields: Record<string, string>
  MaxBytes: number
}

/** A permissao para enviar um anexo, e o identificador com que ele sera confirmado. */
export interface AttachmentUploadTicketViewModel {
  PublicId: string
  File: SignedUploadViewModel
  Thumbnail: SignedUploadViewModel | null
  ExpiresAt: string
}

/**
 * O pedido de permissao.
 *
 * **O protocolo e o token vem junto**, e sao eles que dizem de quem e o relato:
 * sem relato, nao ha permissao nenhuma.
 *
 * **O arquivo vai com um envio**: a criacao do relato (nenhuma bandeira), a
 * resposta (`ForReply`) ou a reabertura (`ForReopen`). As duas bandeiras juntas sao
 * recusadas — um arquivo vai com um envio so.
 */
export interface RequestAttachmentUploadRequest {
  TrackingCode: string
  Token: string
  Kind: MediaKind
  ContentType: string
  /** O que o navegador diz. Serve para recusar cedo; o gravado e o que o armazenamento contar. */
  SizeBytes: number
  /** No arquivo que nao e imagem, e pela extensao dele que a API reconhece o formato. */
  FileName: string
  WithThumbnail: boolean
  /**
   * O formato da miniatura: WebP, ou JPEG onde o navegador nao codifica WebP (o
   * Safari). Sem ele, a API entende WebP.
   */
  ThumbnailContentType?: string
  /**
   * Vai junto da resposta que a pessoa acabou de mandar. **Nao diz qual**: o
   * servidor prende a resposta mais recente dela, se for dos ultimos minutos.
   */
  ForReply?: boolean
  /**
   * Vai junto da reabertura que a pessoa acabou de fazer. **Nao diz qual**, pelo
   * mesmo motivo de `ForReply`.
   */
  ForReopen?: boolean
  /** Em que tamanho a imagem aparece. Sem ele, a API entende a linha inteira. */
  DisplaySize?: AttachmentDisplaySize
  /**
   * A posicao no envio, a partir de zero, **dentro da categoria**: as imagens de 0 em
   * diante, e os arquivos tambem. **A lista do relato sai nessa ordem**, e nao na de
   * chegada: o arquivo tentado de novo chega depois dos outros.
   */
  DisplayOrder?: number
}

/** O aviso de que o arquivo chegou. Sem ele, o anexo nao existe para o produto. */
export interface ConfirmAttachmentRequest {
  TrackingCode: string
  Token: string
  AttachmentPublicId: string
}

/** O anexo, depois de a API conferir os bytes e prender ao relato. */
export interface ConfirmedAttachmentViewModel {
  PublicId: string
  Kind: MediaKind
  SizeBytes: number
}

/**
 * Um anexo como o time ve.
 *
 * **Os enderecos nascem na resposta e morrem em minutos.** `ExpiresAt` e o que a
 * tela usa para pedir de novo antes de a imagem quebrar. O nome original so existe
 * neste tipo — do lado de fora ele nunca sai.
 */
export interface PanelAttachmentViewModel {
  PublicId: string
  Kind: MediaKind
  /**
   * Em que tamanho a imagem aparece — a escolha de quem relatou. A lista ja vem na
   * ordem em que ela montou cada envio.
   */
  DisplaySize: AttachmentDisplaySize
  /** O tipo gravado, conferido pelos bytes — e por ele que a tela diz "PDF" ou "planilha". */
  ContentType: string
  /** No arquivo que nao e imagem, so baixa, com o nome original. */
  Url: string
  ThumbnailUrl: string | null
  ExpiresAt: string
  SizeBytes: number
  /** So os videos antigos tem. */
  DurationSeconds: number | null
  OriginalName: string | null
  /** Veio numa resposta ao pedido de informacao, e nao na criacao do relato. */
  CameWithReply: boolean
  /** A fala da conversa em que o arquivo veio — a tela o mostra logo abaixo dela. */
  ReplyPublicId: string | null
  /** Veio numa reabertura, e nao na criacao do relato. */
  CameWithReopen: boolean
  /** A reabertura em que o arquivo veio — o mesmo `PublicId` de `Reopenings` no detalhe. */
  ReopenPublicId: string | null
  CreatedAt: string
}

/**
 * Um anexo como quem relatou ve. **Outro tipo, e nao o do painel com um campo a
 * menos**: o nome original nem existe aqui.
 */
export interface PublicAttachmentViewModel {
  PublicId: string
  Kind: MediaKind
  /** Em que tamanho a imagem aparece, como a pessoa montou. Ver o do painel. */
  DisplaySize: AttachmentDisplaySize
  /** O tipo gravado, conferido pelos bytes. */
  ContentType: string
  /** Tamanho real — para a pessoa saber o que vai baixar. */
  SizeBytes: number
  /** No arquivo que nao e imagem, so baixa, com um nome generico: o original nunca sai. */
  Url: string
  ThumbnailUrl: string | null
  ExpiresAt: string
  /** So os videos antigos tem. */
  DurationSeconds: number | null
  /** A fala da conversa em que o arquivo veio, quando veio numa resposta. */
  ReplyPublicId: string | null
  /** A reabertura em que o arquivo veio — o mesmo `PublicId` de `Reopenings` no relato. */
  ReopenPublicId: string | null
  CreatedAt: string
}
