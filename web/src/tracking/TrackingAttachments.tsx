import type { PublicAttachmentViewModel } from '@/contracts'
import { AttachmentGallery, type GalleryItem } from '@/shared/components/AttachmentGallery'

/** O que a galeria precisa de um anexo publico. Sem nome original: ele nem existe aqui. */
export function toGalleryItem(anexo: PublicAttachmentViewModel): GalleryItem {
  return {
    id: anexo.PublicId,
    kind: anexo.Kind,
    url: anexo.Url,
    thumbnailUrl: anexo.ThumbnailUrl,
    expiresAt: anexo.ExpiresAt,
  }
}

/**
 * Os arquivos que a pessoa mandou **ao relatar**, na pagina de acompanhamento. Os
 * que vieram numa resposta aparecem na conversa, logo abaixo dela.
 *
 * **Falha fica quieta.** Nesta pagina os arquivos sao complemento: se a leitura
 * falhar, o relato continua inteiro na tela.
 */
export function TrackingAttachments({
  anexos,
  onExpired,
}: {
  anexos: PublicAttachmentViewModel[]
  onExpired: () => void
}) {
  if (anexos.length === 0) return null

  return (
    <div className="mt-5">
      <div className="mb-1.5 text-caption text-fg-muted">O que você anexou</div>
      <AttachmentGallery onExpired={onExpired} items={anexos.map(toGalleryItem)} />
    </div>
  )
}
