import { useEffect, useRef, useState } from 'react'
import type {
  ReportDetailViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { ReportComments } from '@/features/reports/ReportComments'
import { ReportHistory } from '@/features/reports/ReportHistory'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { Modal } from '@/shared/components/Modal'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { formatDateTime } from '@/shared/lib/datetime'
import { teamTypeLabel } from '@/shared/lib/teamReportTypes'

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
 *
 * **Quem manda agora e o endereco**, e nao um clique. Isso traz um caso que antes
 * nao existia: o link aberto direto, em que a lista ainda nao tem este relato —
 * porque esta na pagina cinco, ou porque o recorte escolhido nao o inclui. Ai o
 * `resumo` chega nulo e a tela inteira espera a resposta, em vez de so o contexto.
 */
export function ReportDialog({
  projectPublicId,
  reportPublicId,
  resumo,
  colunas,
  aoMover,
  aoFechar,
}: {
  projectPublicId: string
  reportPublicId: string
  /** O que a lista ja sabe, para desenhar na hora. Nulo quando o link foi aberto direto. */
  resumo: ReportSummaryViewModel | null
  /** As colunas da fila, para onde este relato pode ir. */
  colunas: ReportStateCountViewModel[] | null
  aoMover: (report: ReportSummaryViewModel) => void
  aoFechar: () => void
}) {
  const [detalhe, setDetalhe] = useState<ReportDetailViewModel | null>(null)
  const [failed, setFailed] = useState(false)

  // Abrir outro relato antes de a resposta do primeiro chegar mostraria o
  // contexto de um debaixo do texto do outro.
  const generation = useRef(0)

  useEffect(() => {
    const minha = ++generation.current
    setDetalhe(null)
    setFailed(false)

    projectReportService
      .openReport(projectPublicId, reportPublicId)
      .then((aberto) => {
        if (minha === generation.current) setDetalhe(aberto)
      })
      .catch(() => {
        if (minha === generation.current) setFailed(true)
      })
  }, [projectPublicId, reportPublicId])

  // O resumo da lista ganha do que chegou da API so porque chega antes; os dois
  // dizem a mesma coisa. Quando nao ha resumo, a tela espera.
  const report = resumo ?? detalhe
  const contexts = detalhe?.Contexts ?? null

  // Guarda o relato movido para a tela nao voltar a mostrar a coluna antiga: o
  // resumo veio da lista, e ela so e avisada depois.
  const [movido, setMovido] = useState<ReportSummaryViewModel | null>(null)
  const [movendo, setMovendo] = useState(false)

  // Sobe a cada acao que vira evento. A linha do tempo le isto e busca de novo —
  // sem ele, mover ou comentar deixaria o historico mostrando o estado anterior
  // na frente de quem acabou de agir.
  const [versao, setVersao] = useState(0)

  const atual = movido ?? report

  async function mover(statePublicId: string) {
    if (movendo) return

    setMovendo(true)

    try {
      const salvo = await projectReportService.moveReport(projectPublicId, reportPublicId, {
        StatePublicId: statePublicId,
      })
      setMovido(salvo)
      aoMover(salvo)
      setVersao((n) => n + 1)
    } catch (failure) {
      // A coluna volta sozinha para a antiga, porque o seletor le `atual` e ele
      // nao mudou. O aviso e o unico jeito de contar o que houve.
      toast.error(describeError(failure))
    } finally {
      setMovendo(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar()
      }}
      title={report ? teamTypeLabel(report.Type) : 'Relato'}
      width="w-[min(38rem,calc(100vw-2rem))]"
      footer={
        <Button variant="quiet" onClick={aoFechar}>
          Fechar
        </Button>
      }
    >
      {/* Link aberto direto e que falhou: sem resumo nao ha o que mostrar, e
          insistir num esqueleto eterno seria pior do que dizer o que houve. */}
      {report === null && failed && (
        <p className="text-body text-fg-muted leading-relaxed">
          Não deu para abrir este relato. Ou ele não existe mais, ou a falha foi ao consultar — nada
          se perdeu de um jeito nem do outro.
        </p>
      )}

      {report === null && !failed && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      )}

      {report && (
        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <code className="font-mono text-detail text-fg">{report.TrackingCode}</code>
            <CopyButton value={report.TrackingCode} label="Copiar protocolo" size="sm" />
            <span className="text-detail text-fg-muted tabular-nums">
              {formatDateTime(report.CreatedAt)}
            </span>

            {/* Onde ele esta na fila, e o controle que o move.

                O texto "Coluna" vem num `span`, e nao num `label`: quem da nome
                ao controle e o `ariaLabel` do proprio `Select`, que vira
                `aria-label` no `select`. Um `label` por fora, sem `htmlFor`, nao
                nomeia nada — so parecia nomear. */}
            {colunas && colunas.length > 0 ? (
              <span className="flex items-center gap-1.5 text-caption text-fg-muted">
                Coluna
                <Select
                  className="max-w-40"
                  size="sm"
                  ariaLabel="Mover para a coluna"
                  value={atual?.StatePublicId ?? ''}
                  disabled={movendo}
                  onChange={(valor) => mover(valor)}
                  options={[
                    // "Sem coluna" nao e destino: nao ha como tirar um relato da
                    // fila de volta, e oferecer isso prometeria uma acao que a API
                    // nao tem. Ela so aparece enquanto ele ainda nao tem coluna.
                    ...(atual?.StatePublicId == null ? [{ value: '', label: 'Sem coluna' }] : []),
                    ...colunas
                      .filter((coluna) => coluna.StatePublicId !== null)
                      .filter(
                        (coluna) =>
                          coluna.IsActive || coluna.StatePublicId === atual?.StatePublicId,
                      )
                      .map((coluna) => ({
                        value: coluna.StatePublicId as string,
                        label: coluna.StateName ?? '',
                      })),
                  ]}
                />
              </span>
            ) : (
              atual?.StateName && (
                <span className="rounded-full border border-border px-2 py-px text-caption text-fg-muted">
                  {atual.StateName}
                </span>
              )
            )}

            {/* O outro lado. Fica junto do controle que move de propósito: é aqui
                que alguém decide, e a consequência lá fora precisa estar à vista no
                momento da decisão — não numa tela que se abre depois.

                Vem de `atual`, que é a resposta do próprio movimento. Buscar o
                detalhe de novo **grava um evento de leitura**, e isso mediria
                cliques do time em vez de leituras. */}
            {atual && <LadoDeFora etapa={atual.PublicStageLabel} />}
          </div>

          {/* Antes so o texto rolava. Agora o dialogo tem comentario e historico
              embaixo, e prender a rolagem no texto deixaria o resto inalcancavel —
              entao quem rola e o corpo inteiro, e o protocolo e o botao de fechar
              continuam fixos porque moram fora dele. */}
          <p className="whitespace-pre-wrap break-words text-body text-fg leading-relaxed">
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

          <ReportComments
            projectPublicId={projectPublicId}
            reportPublicId={reportPublicId}
            aoComentar={() => setVersao((n) => n + 1)}
          />

          <ReportHistory
            projectPublicId={projectPublicId}
            reportPublicId={reportPublicId}
            versao={versao}
          />
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

/**
 * Onde quem relatou vê este relato.
 *
 * **Nulo não diz por quê** — pode ser coluna fora do mapa, projeto sem jornada, ou
 * relato que entrou antes de a jornada existir. A frase cobre os três, porque
 * distinguir exigiria um campo que ficaria desatualizado no primeiro movimento, e
 * aviso errado é pior que aviso nenhum. Quem precisa da diferença a encontra em
 * Etapas públicas, que lista os estados sem destino.
 */
function LadoDeFora({ etapa }: { etapa: string | null }) {
  if (etapa === null) {
    return <span className="text-caption text-fg-muted">Ainda não aparece para quem relatou</span>
  }

  return (
    <span className="text-caption text-fg-muted">
      Quem relatou vê: <span className="text-fg">{etapa}</span>
    </span>
  )
}
