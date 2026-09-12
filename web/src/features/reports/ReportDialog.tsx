import { useEffect, useRef, useState } from 'react'
import type { ReportContextViewModel, ReportSummaryViewModel } from '@/contracts'
import { projectReportService } from '@/data'
import { reportTypeLabel } from '@/features/reports/reportTypeLabel'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { Modal } from '@/shared/components/Modal'
import { Skeleton } from '@/shared/components/Skeleton'
import { formatDateTime } from '@/shared/lib/datetime'

/**
 * Um relato aberto.
 *
 * **Abrir grava.** A API registra a visualizacao, e o intervalo entre ela e a
 * criacao e o tempo que o time levou para ir olhar — metade da pergunta que este
 * trabalho investiga. Dai a busca acontecer no clique, e nunca antes: carregar os
 * relatos por adiantamento inventaria leituras que nao aconteceram.
 *
 * O texto que a lista ja tem aparece **na hora**, e so o contexto espera a
 * resposta. Sem isso, o clique abriria um retangulo vazio para reapresentar meio
 * segundo depois o que ja estava na tela — e uma falha de rede esconderia o
 * relato inteiro por causa do dado acessorio.
 */
export function ReportDialog({
  projectPublicId,
  report,
  onOpenChange,
}: {
  projectPublicId: string
  /** `null` fecha. O relato vem da lista, entao ja traz texto, tipo e data. */
  report: ReportSummaryViewModel | null
  onOpenChange: (open: boolean) => void
}) {
  const [contexts, setContexts] = useState<ReportContextViewModel[] | null>(null)
  const [failed, setFailed] = useState(false)

  // Abrir outro relato antes de a resposta do primeiro chegar mostraria o
  // contexto de um debaixo do texto do outro.
  const generation = useRef(0)

  const publicId = report?.PublicId ?? null

  useEffect(() => {
    if (publicId === null) return

    const minha = ++generation.current
    setContexts(null)
    setFailed(false)

    projectReportService
      .openReport(projectPublicId, publicId)
      .then((opened) => {
        if (minha === generation.current) setContexts(opened.Contexts)
      })
      .catch(() => {
        if (minha === generation.current) setFailed(true)
      })
  }, [projectPublicId, publicId])

  return (
    <Modal
      open={report !== null}
      onOpenChange={onOpenChange}
      title={report ? reportTypeLabel(report.Type) : 'Relato'}
      width="w-[min(38rem,calc(100vw-2rem))]"
      footer={
        <Button variant="quiet" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      }
    >
      {report && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <code className="font-mono text-detail text-fg">{report.TrackingCode}</code>
            <CopyButton value={report.TrackingCode} label="Copiar protocolo" size="sm" />
            <span className="text-detail text-fg-muted tabular-nums">
              {formatDateTime(report.CreatedAt)}
            </span>
          </div>

          {/* O texto rola dentro do dialogo, e nao o dialogo inteiro: o protocolo
              e o botao de fechar precisam continuar visiveis num relato longo. */}
          <p className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap break-words text-body text-fg leading-relaxed">
            {report.Text}
          </p>

          <section className="border-border border-t pt-4">
            <h3 className="mb-2.5 font-medium text-detail text-fg">Onde aconteceu</h3>

            <dl className="flex flex-col gap-1.5">
              <Entry label="Página" value={report.Route} />
              <Entry label="Site" value={report.Origin} />

              {failed && (
                <p className="mt-1 text-caption text-fg-muted">
                  O resto do contexto não carregou. O relato acima é o que a pessoa escreveu, e está
                  completo.
                </p>
              )}

              {!failed && contexts === null && (
                <>
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </>
              )}

              {contexts?.map((context) => (
                <Entry key={context.Key} label={contextLabel(context.Key)} value={context.Value} />
              ))}
            </dl>

            {contexts?.length === 0 && !failed && (
              <p className="mt-1 text-caption text-fg-muted">
                A ferramenta não enviou mais nada além do endereço.
              </p>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}

/**
 * As chaves que a ferramenta manda hoje, em portugues.
 *
 * A chave e um nome tecnico em ingles porque quem a escreve e o codigo e ela
 * tambem serve a consulta no banco. O que a tela mostra e outra coisa, e chave
 * desconhecida aparece como veio: e melhor ler `screen_depth` do que nao ver que
 * o dado existe.
 */
const CONTEXT_LABELS: Record<string, string> = {
  language: 'Idioma',
  user_agent: 'Navegador',
  viewport: 'Tela',
}

function contextLabel(key: string): string {
  return CONTEXT_LABELS[key] ?? key
}

/**
 * Uma linha do contexto. Sai da tela quando nao ha valor: "Site: —" ocupa a mesma
 * altura de um dado para nao dizer nada.
 */
function Entry({ label, value }: { label: string; value: string | null }) {
  if (value === null || value.trim().length === 0) return null

  return (
    <div className="flex gap-2 text-detail">
      <dt className="w-28 flex-none text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{value}</dd>
    </div>
  )
}
