import { publicMediaService } from '@/data/publicIndex'
import type { Anexo } from '@/embed/attachments'

/** O que prova que o relato e de quem esta enviando: o que saiu da criacao dele. */
export interface ReportCredentials {
  trackingCode: string
  token: string
}

/**
 * Leva um arquivo ate o fim: permissao, envio direto e confirmacao.
 *
 * **Os tres passos, e so dois sao nossos.** Pedir a permissao e confirmar passam
 * pela API — e ali que moram a autorizacao, o limite do projeto e a conferencia dos
 * bytes. O envio vai direto para o armazenamento.
 *
 * **Tentar de novo comeca do zero**, com permissao nova. A anterior pode ter
 * vencido, e reaproveita-la seria apostar num prazo de minutos. O que ficou para
 * tras e orfao, e a API ja o marca assim.
 *
 * **A miniatura que falha nao derruba o anexo.** O arquivo vale sem ela, e a API
 * tira a miniatura ausente da linha na confirmacao.
 */
export async function sendAttachment(
  credentials: ReportCredentials,
  anexo: Anexo,
  onProgress: (fraction: number) => void,
  { forReply = false }: { forReply?: boolean } = {},
): Promise<void> {
  const ticket = await publicMediaService.requestUpload({
    TrackingCode: credentials.trackingCode,
    Token: credentials.token,
    Kind: anexo.kind,
    ContentType: anexo.file.type,
    SizeBytes: anexo.file.size,
    FileName: anexo.file.name,
    DurationSeconds: anexo.durationSeconds ?? undefined,
    WithThumbnail: anexo.thumbnail !== null,
    // Na resposta, o servidor prende o arquivo a resposta mais recente de quem
    // relatou. O navegador nao diz qual — ver `ForReply` na API.
    ForReply: forReply,
  })

  await publicMediaService.uploadToStorage(ticket.File, anexo.file, onProgress)

  if (anexo.thumbnail && ticket.Thumbnail) {
    await publicMediaService.uploadToStorage(ticket.Thumbnail, anexo.thumbnail).catch(() => {
      // Sem miniatura o anexo continua valendo. Ver o comentario da funcao.
    })
  }

  await publicMediaService.confirm({
    TrackingCode: credentials.trackingCode,
    Token: credentials.token,
    AttachmentPublicId: ticket.PublicId,
  })
}
