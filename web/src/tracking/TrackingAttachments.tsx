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
    displaySize: anexo.DisplaySize,
  }
}

/**
 * Os arquivos que a pessoa mandou **ao relatar**, na pagina de acompanhamento, logo
 * abaixo do texto, no tamanho que ela escolheu. Os que vieram numa resposta aparecem
 * na conversa, logo abaixo dela.
 *
 * **Sem titulo na tela.** A imagem e parte do que a pessoa escreveu, e um "o que voce
 * anexou" entre os dois os separaria; o nome da lista fica para o leitor de tela.
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
    <div className="mt-4">
      <AttachmentGallery
        label="O que você anexou"
        onExpired={onExpired}
        items={anexos.map(toGalleryItem)}
      />
    </div>
  )
}
