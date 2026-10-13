import { useCallback } from 'react'
import { reportService } from '@/data/publicIndex'
import { Button } from '@/shared/components/Button'
import { PublicReportCard } from '@/shared/components/PublicReportCard'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/**
 * "O que já foi relatado" — a vitrine, dentro do próprio quadro.
 *
 * **Tudo aqui passou por alguém.** Nenhum relato chega nesta lista sem ter sido
 * lido e liberado no painel do cliente: é a regra da vitrine, e é por isso que
 * marcar o projeto como público não publica nada sozinho.
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
            <PublicReportCard
              as="li"
              // Sem identificador nenhum na resposta, a chave é o conteúdo com a
              // data — e duas publicações no mesmo instante com o mesmo texto são
              // o mesmo relato para quem lê.
              key={`${relato.PublishedAt}-${relato.Text.slice(0, 40)}`}
              typeName={relato.TypeName}
              reporterName={relato.ReporterName}
              stageLabel={relato.StageLabel}
              isClosed={relato.IsClosed}
              text={relato.Text}
              publishedAt={relato.PublishedAt}
            />
          ))}
        </ul>
      )}

      {lista?.HasMore && (
        <p className="text-caption text-fg-muted leading-relaxed">Estes são os mais recentes.</p>
      )}
    </section>
  )
}
