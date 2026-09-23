/** Espelho de `Pds.Domain/Dtos/ReportAttachmentDtos.cs` e `ViewModels/ReportAttachmentViewModels.cs`. */

import type { MediaKind } from '@/contracts/mediaSettings'

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
 */
export interface RequestAttachmentUploadRequest {
  TrackingCode: string
  Token: string
  Kind: MediaKind
  ContentType: string
  /** O que o navegador diz. Serve para recusar cedo; o gravado e o que o armazenamento contar. */
  SizeBytes: number
  FileName: string
  DurationSeconds?: number
  WithThumbnail: boolean
  /**
   * Vai junto da resposta que a pessoa acabou de mandar. **Nao diz qual**: o
   * servidor prende a resposta mais recente dela, se for dos ultimos minutos.
   */
  ForReply?: boolean
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
  DurationSeconds: number | null
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
  Url: string
  ThumbnailUrl: string | null
  ExpiresAt: string
  SizeBytes: number
  DurationSeconds: number | null
  OriginalName: string | null
  /** Veio numa resposta ao pedido de informacao, e nao na criacao do relato. */
  CameWithReply: boolean
  /** A fala da conversa em que o arquivo veio — a tela o mostra logo abaixo dela. */
  ReplyPublicId: string | null
  CreatedAt: string
}

/**
 * Um anexo como quem relatou ve. **Outro tipo, e nao o do painel com um campo a
 * menos**: o nome original nem existe aqui.
 */
export interface PublicAttachmentViewModel {
  PublicId: string
  Kind: MediaKind
  Url: string
  ThumbnailUrl: string | null
  ExpiresAt: string
  DurationSeconds: number | null
  /** A fala da conversa em que o arquivo veio, quando veio numa resposta. */
  ReplyPublicId: string | null
  CreatedAt: string
}
