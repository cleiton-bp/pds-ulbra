import { formatRelative } from '@/shared/lib/datetime'

/**
 * Um relato liberado como qualquer pessoa o le na lista publica — o mesmo desenho no
 * quadro (`embed/PublicList`) e na previa da Moderacao.
 *
 * **Mora em `shared` para a previa nao mentir.** A Moderacao mostra "na lista publica
 * vai aparecer assim" antes de liberar; com uma copia do desenho, a previa e a lista
 * divergiriam na primeira mudanca de um dos lados, e a previa passaria a prometer o
 * que nao acontece.
 *
 * So pecas puras: nada aqui fala com a API — o quadro roda no site do cliente.
 */
export function PublicReportCard({
  as: Tag = 'div',
  typeName,
  reporterName,
  stageLabel,
  isClosed,
  text,
  publishedAt,
}: {
  /** `li` dentro da lista do quadro; `div` sozinho, na previa. */
  as?: 'li' | 'div'
  typeName: string
  /** Nulo quando o nome nao sai: a regra e da API (projeto identificado e a pessoa quis). */
  reporterName: string | null
  stageLabel: string | null
  isClosed: boolean
  text: string
  publishedAt: string
}) {
  return (
    <Tag className="rounded-lg border border-border bg-surface-raised p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-caption text-fg-muted">
          {typeName}
          {reporterName !== null && ` · ${reporterName}`}
        </span>
        <span className="flex-none text-caption text-fg-muted">
          {isClosed ? 'Encerrado' : (stageLabel ?? 'Em andamento')}
        </span>
      </div>

      {/* Inteiro e com as quebras originais: foi este texto que alguem
          leu e liberou, e mostrar outro seria publicar o que nao passou. */}
      <p className="mb-1.5 whitespace-pre-wrap text-detail text-fg leading-relaxed">{text}</p>

      <time dateTime={publishedAt} className="text-caption text-fg-muted">
        {formatRelative(publishedAt)}
      </time>
    </Tag>
  )
}
