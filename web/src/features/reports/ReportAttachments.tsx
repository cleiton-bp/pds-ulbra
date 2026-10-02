import { useCallback } from 'react'
import type { PanelAttachmentViewModel } from '@/contracts'
import { projectReportAttachmentService } from '@/data'
import { AttachmentGallery, type GalleryItem } from '@/shared/components/AttachmentGallery'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { formatBytes } from '@/shared/lib/formatBytes'

/**
 * Os arquivos de um relato, lidos uma vez para o dialogo inteiro.
 *
 * **Uma leitura so, e tres lugares.** Os da criacao vao para baixo do texto do
 * relato; os de uma resposta vao para a conversa, embaixo da fala; os de uma
 * reabertura vao para junto do motivo dela. Ler em cada lugar faria as telas pedirem enderecos
 * assinados em dobro — e vencerem em momentos diferentes.
 *
 * @param reaberturas As reaberturas que o dialogo mostra, pelo identificador. **O
 *   arquivo de uma reabertura que nao esta ali cai embaixo do relato**, em vez de sumir:
 *   o detalhe que falhou, ou o dialogo aberto antes de a pessoa reabrir, nao mostram
 *   a reabertura — e o arquivo iria para um lugar que nao aparece. Nulo enquanto o
 *   detalhe carrega: ai o arquivo espera, em vez de aparecer num lugar e pular para
 *   o outro.
 * @param falas As falas publicas que a conversa mostra — ver `useReportComments`. **O
 *   arquivo de uma resposta que nao esta ali tambem cai embaixo do relato**: a conversa
 *   que nao carregou, ou a resposta que chegou depois de o dialogo abrir, e que a
 *   renovacao dos enderecos trouxe. Nulo enquanto a conversa carrega.
 */
export function useReportAttachments(
  projectPublicId: string,
  reportPublicId: string,
  reaberturas: ReadonlySet<string> | null = null,
  falas: ReadonlySet<string> | null = null,
) {
  const { data, failed, reload, refresh } = useAsyncResource(
    useCallback(
      () => projectReportAttachmentService.listAttachments(projectPublicId, reportPublicId),
      [projectPublicId, reportPublicId],
    ),
  )

  const anexos = data ?? []
  const daCriacao: PanelAttachmentViewModel[] = []
  const porFala = new Map<string, PanelAttachmentViewModel[]>()
  const porReabertura = new Map<string, PanelAttachmentViewModel[]>()
  // O que nao esta na tela vai depois dos da criacao, e nao no meio: a lista vem na
  // ordem da montagem de cada envio, e intercalar desmontaria a da criacao.
  const semLugar: PanelAttachmentViewModel[] = []

  for (const anexo of anexos) {
    if (anexo.ReplyPublicId && (falas === null || falas.has(anexo.ReplyPublicId))) {
      porFala.set(anexo.ReplyPublicId, [...(porFala.get(anexo.ReplyPublicId) ?? []), anexo])
    } else if (
      anexo.ReopenPublicId &&
      (reaberturas === null || reaberturas.has(anexo.ReopenPublicId))
    ) {
      porReabertura.set(anexo.ReopenPublicId, [
        ...(porReabertura.get(anexo.ReopenPublicId) ?? []),
        anexo,
      ])
    } else if (anexo.ReplyPublicId || anexo.ReopenPublicId) {
      semLugar.push(anexo)
    } else {
      // Embaixo do relato fica o que veio com ele. O da reabertura ali pareceria ter
      // chegado junto do texto original — e ele e a prova de que o problema voltou.
      daCriacao.push(anexo)
    }
  }
  daCriacao.push(...semLugar)

  return {
    daCriacao,
    porFala,
    porReabertura,
    failed,
    reload,
    /** Renova os enderecos sem tirar a lista da tela — e o da galeria. */
    refresh,
  }
}

/**
 * O que o painel lembra embaixo dos arquivos. **O arquivo vem de quem relatou**, e o
 * que ha dentro de uma planilha ou de um documento ninguem conferiu: a leitura e sempre
 * download, e o resto e cuidado de quem abre.
 */
export const AVISO_DE_ARQUIVO =
  'Os arquivos vêm de quem relatou: abra só o que você esperava receber.'

/**
 * O que a galeria mostra de um anexo, para o time: a imagem no tamanho que quem
 * relatou escolheu, e embaixo o nome original, o tamanho e a duracao.
 */
export function toPanelGalleryItem(anexo: PanelAttachmentViewModel): GalleryItem {
  return {
    id: anexo.PublicId,
    kind: anexo.Kind,
    url: anexo.Url,
    thumbnailUrl: anexo.ThumbnailUrl,
    expiresAt: anexo.ExpiresAt,
    displaySize: anexo.DisplaySize,
    contentType: anexo.ContentType,
    sizeBytes: anexo.SizeBytes,
    caption: [
      anexo.OriginalName,
      formatBytes(anexo.SizeBytes),
      anexo.DurationSeconds ? `${anexo.DurationSeconds}s` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

/** O item da galeria do relato, com a origem na legenda quando ele veio noutro envio. */
function comOrigem(anexo: PanelAttachmentViewModel): GalleryItem {
  const item = toPanelGalleryItem(anexo)
  const origem = anexo.ReplyPublicId
    ? 'veio numa resposta'
    : anexo.ReopenPublicId
      ? 'veio numa reabertura'
      : null
  return origem ? { ...item, caption: [item.caption, origem].filter(Boolean).join(' · ') } : item
}

/**
 * Os arquivos que vieram **com o relato**, para o time — logo abaixo do texto, no
 * tamanho e na ordem em que quem relatou os montou. O time ve o relato como ele foi
 * escrito.
 *
 * **Sem titulo na tela.** A imagem e parte do que a pessoa escreveu, e um "Arquivos"
 * entre os dois os separaria; o nome da lista fica para o leitor de tela.
 *
 * **Nao aparece nada quando nao ha arquivo.** Um "nenhum arquivo" em todo relato sem
 * print ocuparia espaco para dizer o que a ausencia ja diz.
 *
 * **O nome original aparece so aqui.** O time precisa dele para entender o que
 * chegou; do lado de fora ele nunca sai.
 *
 * Os de uma resposta nao estao aqui: estao na conversa, embaixo da fala que os
 * trouxe. Os de uma reabertura estao em "Reaberturas", junto do motivo. **O que nao
 * acha o seu lugar na tela vem para ca**, depois dos da criacao — a conversa que nao
 * carregou, a resposta que chegou com o dialogo aberto: um arquivo que some em
 * silencio e o erro que ninguem percebe. **E diz de onde veio**, na legenda: sem isso,
 * ele pareceria ter chegado junto do texto original.
 */
export function ReportAttachments({
  anexos,
  failed,
  onReload,
  onExpired,
}: {
  anexos: PanelAttachmentViewModel[]
  failed: boolean
  /** "Tentar de novo": busca do zero. */
  onReload: () => void
  /** Endereco vencendo: renova sem tirar a lista da tela. */
  onExpired: () => void
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
    <AttachmentGallery
      label="Imagens do relato"
      fileLabel="Arquivos do relato"
      fileNote={AVISO_DE_ARQUIVO}
      onExpired={onExpired}
      items={anexos.map(comOrigem)}
    />
  )
}
