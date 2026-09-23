import { useCallback } from 'react'
import type { PanelAttachmentViewModel } from '@/contracts'
import { projectReportAttachmentService } from '@/data'
import { AttachmentGallery, type GalleryItem } from '@/shared/components/AttachmentGallery'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { formatBytes } from '@/shared/lib/formatBytes'

/**
 * Os arquivos de um relato, lidos uma vez para o dialogo inteiro.
 *
 * **Uma leitura so, e duas telas.** Os da criacao vao para a secao de arquivos; os
 * de uma resposta vao para a conversa, embaixo da fala. Ler em cada lugar faria as
 * duas pedirem enderecos assinados em dobro — e vencerem em momentos diferentes.
 */
export function useReportAttachments(projectPublicId: string, reportPublicId: string) {
  const { data, failed, reload } = useAsyncResource(
    useCallback(
      () => projectReportAttachmentService.listAttachments(projectPublicId, reportPublicId),
      [projectPublicId, reportPublicId],
    ),
  )

  const anexos = data ?? []
  const porFala = new Map<string, PanelAttachmentViewModel[]>()
  for (const anexo of anexos) {
    if (anexo.ReplyPublicId) {
      porFala.set(anexo.ReplyPublicId, [...(porFala.get(anexo.ReplyPublicId) ?? []), anexo])
    }
  }

  return {
    daCriacao: anexos.filter((anexo) => anexo.ReplyPublicId === null),
    porFala,
    failed,
    reload,
  }
}

/** O que a galeria mostra de um anexo, para o time: nome original, tamanho e duracao. */
export function toPanelGalleryItem(anexo: PanelAttachmentViewModel): GalleryItem {
  return {
    id: anexo.PublicId,
    kind: anexo.Kind,
    url: anexo.Url,
    thumbnailUrl: anexo.ThumbnailUrl,
    expiresAt: anexo.ExpiresAt,
    caption: [
      anexo.OriginalName,
      formatBytes(anexo.SizeBytes),
      anexo.DurationSeconds ? `${anexo.DurationSeconds}s` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

/**
 * Os arquivos que vieram **com o relato**, para o time.
 *
 * **Nao aparece nada quando nao ha arquivo.** Uma secao "Arquivos: nenhum" em todo
 * relato sem print ocuparia espaco para dizer o que a ausencia ja diz.
 *
 * **O nome original aparece so aqui.** O time precisa dele para entender o que
 * chegou; do lado de fora ele nunca sai.
 *
 * Os de uma resposta nao estao aqui: estao na conversa, embaixo da fala que os
 * trouxe. Fala publica nao se apaga nem se edita, entao o arquivo sempre encontra a
 * dele.
 */
export function ReportAttachments({
  anexos,
  failed,
  onReload,
}: {
  anexos: PanelAttachmentViewModel[]
  failed: boolean
  onReload: () => void
}) {
  if (failed) {
    return (
      <p className="text-caption text-fg-muted leading-normal">
        Não deu para carregar os arquivos deste relato agora.{' '}
        <button
          type="button"
          onClick={onReload}
          className="font-medium text-fg underline underline-offset-4"
        >
          Tentar de novo
        </button>
      </p>
    )
  }

  if (anexos.length === 0) return null

  return (
    <section className="border-border border-t pt-4">
      <h3 className="mb-2.5 font-medium text-detail text-fg">Arquivos</h3>
      <AttachmentGallery onExpired={onReload} items={anexos.map(toPanelGalleryItem)} />
    </section>
  )
}
