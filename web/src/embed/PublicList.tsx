import { useCallback } from 'react'
import { reportService } from '@/data/publicIndex'
import { Button } from '@/shared/components/Button'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { formatRelative } from '@/shared/lib/datetime'
import { reporterTypeLabel } from '@/shared/lib/reportTypes'

/**
 * "O que já foi relatado" — a vitrine, dentro do próprio quadro.
 *
 * **Tudo aqui passou por alguém.** Nenhum relato chega nesta lista sem ter sido
 * lido e liberado no painel do cliente: é a ordem da etapa, e é por isso que os
 * três níveis de visibilidade nasceram um passo antes sem ligar lista nenhuma.
 *
 * **Não há protocolo, e não há como abrir um.** O protocolo é curto e é metade
 * da credencial de quem relatou — mostrá-lo aqui entregaria a estranhos o número
 * que a própria pessoa usa para voltar. Quem lê esta lista lê o texto, e mais
 * nada.
 *
 * **Lista vazia não é erro, e pode ser o normal.** Projeto privado responde
 * exatamente como projeto público sem nada liberado, de propósito — a rota não
 * conta a configuração do cliente a quem só tem a chave pública.
 */
export function PublicList({ publicKey, onBack }: { publicKey: string; onBack: () => void }) {
  const {
    data: lista,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(() => reportService.listPublished({ Key: publicKey }), [publicKey]),
  )

  return (
    <section className="flex h-full flex-col gap-4 overflow-y-auto bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-semibold text-fg text-lead tracking-tight">O que já foi relatado</h1>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Voltar
        </Button>
      </div>

      {failed && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-caption text-fg-muted leading-relaxed">
            Não deu para carregar agora. Nada mudou: a falha foi ao consultar.
          </p>
          <Button size="sm" onClick={reload}>
            Tentar de novo
          </Button>
        </div>
      )}

      {loading && <p className="text-caption text-fg-muted">Carregando…</p>}

      {lista !== null && lista.Reports.length === 0 && (
        <p className="text-caption text-fg-muted leading-relaxed">
          Ainda não há nada por aqui. Relato só aparece nesta lista depois de alguém da equipe
          liberar.
        </p>
      )}

      {lista !== null && lista.Reports.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {lista.Reports.map((relato) => (
            <li
              // Sem identificador nenhum na resposta, a chave é o conteúdo com a
              // data — e duas publicações no mesmo instante com o mesmo texto são
              // o mesmo relato para quem lê.
              key={`${relato.PublishedAt}-${relato.Text.slice(0, 40)}`}
              className="rounded-lg border border-border bg-surface-raised p-3"
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-caption text-fg-muted">
                  {reporterTypeLabel(relato.Type)}
                  {relato.ReporterName !== null && ` · ${relato.ReporterName}`}
                </span>
                <span className="flex-none text-caption text-fg-muted">
                  {relato.IsClosed ? 'Encerrado' : (relato.StageLabel ?? 'Em andamento')}
                </span>
              </div>

              {/* Inteiro e com as quebras originais: foi este texto que alguém
                  leu e liberou, e mostrar outro seria publicar o que não passou. */}
              <p className="mb-1.5 whitespace-pre-wrap text-detail text-fg leading-relaxed">
                {relato.Text}
              </p>

              <time dateTime={relato.PublishedAt} className="text-caption text-fg-muted">
                {formatRelative(relato.PublishedAt)}
              </time>
            </li>
          ))}
        </ul>
      )}

      {lista?.HasMore && (
        <p className="text-caption text-fg-muted leading-relaxed">Estes são os mais recentes.</p>
      )}
    </section>
  )
}
