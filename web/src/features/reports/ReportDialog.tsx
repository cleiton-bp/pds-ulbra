import { useEffect, useRef, useState } from 'react'
import type {
  PublicOutcome,
  ReportClosureViewModel,
  ReportDetailViewModel,
  ReportInfoRequestViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { AskInfoDialog } from '@/features/reports/AskInfoDialog'
import { CloseReportDialog } from '@/features/reports/CloseReportDialog'
import { ReportAttachments, useReportAttachments } from '@/features/reports/ReportAttachments'
import { ReportComments } from '@/features/reports/ReportComments'
import { ReportHistory } from '@/features/reports/ReportHistory'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { Modal } from '@/shared/components/Modal'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { formatDateTime } from '@/shared/lib/datetime'
import { publicOutcomeLabel } from '@/shared/lib/publicOutcomes'
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
        if (minha !== generation.current) return

        setDetalhe(aberto)
        setFechamento(aberto.Closure)
        setPedido(aberto.InfoRequest)
        setPodePedir(aberto.CanAskInfo)
      })
      .catch(() => {
        if (minha === generation.current) setFailed(true)
      })
  }, [projectPublicId, reportPublicId])

  // O resumo da lista ganha do que chegou da API so porque chega antes; os dois
  // dizem a mesma coisa. Quando nao ha resumo, a tela espera.
  const report = resumo ?? detalhe
  // Uma leitura para o dialogo inteiro: os da criacao vao para a secao de
  // arquivos, os de uma resposta vao para a conversa.
  const anexos = useReportAttachments(projectPublicId, reportPublicId)

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

  /**
   * O fim do relato, quando ja houve um.
   *
   * **E estado proprio, e nao `detalhe.Closure`.** Encerrar pelo movimento devolve
   * o resumo, que nao carrega o fechamento — sem isto, a tela continuaria
   * oferecendo "Concluir" um segundo depois de encerrar, e so pararia quando
   * alguem fechasse e abrisse de novo. Buscar o detalhe outra vez nao serve:
   * **abrir grava** um evento de leitura.
   */
  const [fechamento, setFechamento] = useState<ReportClosureViewModel | null>(null)

  /**
   * O pedido de informação aberto, e se dá para abrir um.
   *
   * **Estado próprio, pelo mesmo motivo do fechamento**: pedir devolve o relato
   * atualizado, e `detalhe` continuaria com o valor de antes — a tela ofereceria
   * pedir de novo um segundo depois de ter pedido.
   */
  const [pedido, setPedido] = useState<ReportInfoRequestViewModel | null>(null)
  const [podePedir, setPodePedir] = useState(false)
  const [pedindo, setPedindo] = useState(false)
  const [perguntando, setPerguntando] = useState(false)

  /**
   * O encerramento em curso, enquanto o dialogo do motivo esta aberto.
   *
   * `publicId` nulo e o encerramento **por botao**: nao ha para onde mover. O nome
   * da coluna vem guardado junto porque a frase de la fala dele, e recalcular na
   * hora de desenhar leria uma lista que pode ter sido recarregada no meio.
   */
  const [encerrando, setEncerrando] = useState<{
    publicId: string | null
    nome: string | null
  } | null>(null)

  /**
   * A coluna que encerra neste projeto, ou nulo quando nenhuma encerra — que e o
   * projeto configurado para encerrar por botao.
   */
  const colunaQueEncerra = colunas?.find((item) => item.ClosesReport) ?? null

  /**
   * Quando oferecer o botao de concluir.
   *
   * Dois casos, e o segundo e o que costuma ser esquecido: o projeto que encerra
   * **por botao**, e o projeto que encerra pela ultima coluna com o relato **ja
   * parado nela** — ali mover para onde ele ja esta nao e movimento, e sem o botao
   * esse relato nao teria como ser encerrado nunca.
   *
   * So depois de o detalhe chegar: antes dele nao se sabe se o relato ja acabou, e
   * oferecer encerrar o que ja esta encerrado e pior do que demorar um instante.
   */
  const ofereceBotao =
    detalhe !== null &&
    fechamento === null &&
    (colunaQueEncerra === null || colunaQueEncerra.StatePublicId === atual?.StatePublicId)

  /**
   * O clique no seletor. **Nem todo destino move na hora**: a coluna que encerra
   * abre o dialogo do motivo primeiro, e o movimento so acontece depois que ele
   * for confirmado.
   *
   * Quem diz qual coluna encerra e a API, em `ClosesReport`. Deduzir aqui pela
   * ordem da lista repetiria a regra em dois lugares — e a lista traz as
   * aposentadas junto, entao a ultima dela nao e a que encerra.
   */
  function escolher(statePublicId: string) {
    if (colunaQueEncerra?.StatePublicId === statePublicId) {
      setEncerrando({
        publicId: statePublicId,
        nome: colunaQueEncerra.StateName ?? 'esta coluna',
      })
      return
    }

    void mover(statePublicId)
  }

  async function mover(
    statePublicId: string,
    fechamento_?: { Outcome: PublicOutcome; Reason: string },
  ) {
    if (movendo) return

    setMovendo(true)

    try {
      const salvo = await projectReportService.moveReport(projectPublicId, reportPublicId, {
        StatePublicId: statePublicId,
        ...fechamento_,
      })
      setMovido(salvo)
      aoMover(salvo)
      setVersao((n) => n + 1)
      setEncerrando(null)

      // O movimento devolve o resumo, que nao carrega o fechamento — entao ele e
      // montado aqui com o que acabou de ser mandado. **Sem inventar o autor**: o
      // bloco simplesmente nao diz quem encerrou ate alguem reabrir a tela, e nao
      // ha frase nenhuma para um nome ausente.
      if (fechamento_ !== undefined)
        setFechamento({
          Outcome: fechamento_.Outcome,
          Reason: fechamento_.Reason,
          ClosedAt: new Date().toISOString(),
          ClosedByName: null,
          // Quem relatou ainda não viu: acabou de encerrar.
          ConfirmedAt: null,
          Satisfaction: null,
          SatisfactionDeclined: false,
        })
    } catch (failure) {
      // A coluna volta sozinha para a antiga, porque o seletor le `atual` e ele
      // nao mudou. O aviso e o unico jeito de contar o que houve.
      //
      // O dialogo do motivo **fica aberto** quando a falha veio dele: o texto que a
      // pessoa escreveu continua na tela para ela tentar de novo, em vez de sumir
      // junto com o erro.
      toast.error(describeError(failure))
    } finally {
      setMovendo(false)
    }
  }

  /**
   * Encerra sem mover.
   *
   * **Rota propria, e nao o movimento com um destino inventado.** O botao existe
   * para o time cuja ultima coluna nao quer dizer "acabou" — arrastar o relato
   * para outro lugar por causa do encerramento desarrumaria a fila de quem
   * escolheu esta opcao justamente para nao ter de arruma-la.
   */
  async function encerrar(outcome: PublicOutcome, reason: string) {
    if (movendo) return

    setMovendo(true)

    try {
      const aberto = await projectReportService.closeReport(projectPublicId, reportPublicId, {
        Outcome: outcome,
        Reason: reason,
      })

      // Esta rota devolve o relato **aberto**, e nao o resumo: o fechamento vem
      // completo, com quem encerrou, sem precisar inventar nada.
      setDetalhe(aberto)
      setFechamento(aberto.Closure)
      setPedido(aberto.InfoRequest)
      setPodePedir(aberto.CanAskInfo)
      setVersao((n) => n + 1)
      setEncerrando(null)
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setMovendo(false)
    }
  }

  /**
   * Devolve o relato pedindo informação.
   *
   * **Não encerra nada**, e é essa a diferença que dá nome ao passo: quem precisa
   * de contexto e quem recusa de fato tomaram decisões opostas, e chegando iguais
   * do outro lado a pessoa entende que acabou e para de responder.
   */
  async function pedirInformacao(body: string) {
    if (pedindo) return

    setPedindo(true)

    try {
      const aberto = await projectReportService.askInfo(projectPublicId, reportPublicId, {
        Body: body,
      })

      setDetalhe(aberto)
      setPedido(aberto.InfoRequest)
      setPodePedir(aberto.CanAskInfo)
      setVersao((n) => n + 1)
      setPerguntando(false)
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setPedindo(false)
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

            {/* **Quem abre um relato para responder precisa saber se está falando
                em público.** A decisão se toma na Moderação; aqui é só o estado,
                porque descobrir depois de escrever é descobrir tarde.

                "Liberado" e não "público": o projeto também precisa estar num
                nível público, e esta tela não sabe disso. */}
            {detalhe?.ModerationState === 'Approved' && (
              <span className="rounded-md border border-warn-border bg-warn-surface px-1.5 py-0.5 text-caption text-warn-fg">
                Liberado para o público
              </span>
            )}

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
                  onChange={(valor) => escolher(valor)}
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

            {/* A escolha de quem relatou, **antes** de alguém tentar perguntar.
                Descobrir depois — ao esbarrar numa recusa — faria a pessoa do time
                escrever a pergunta para só então saber que ela não vai sair. */}
            {atual && <AceitaDuvidas escolha={atual.AcceptsQuestions} />}

            {atual?.PublicStageDueAt && <Esperando vence={atual.PublicStageDueAt} />}
          </div>

          {/* Antes so o texto rolava. Agora o dialogo tem comentario e historico
              embaixo, e prender a rolagem no texto deixaria o resto inalcancavel —
              entao quem rola e o corpo inteiro, e o protocolo e o botao de fechar
              continuam fixos porque moram fora dele. */}
          <p className="whitespace-pre-wrap break-words text-body text-fg leading-relaxed">
            {report.Text}
          </p>

          <ReportAttachments
            anexos={anexos.daCriacao}
            failed={anexos.failed}
            onReload={anexos.reload}
            onExpired={anexos.refresh}
          />

          {pedido && <Devolvido pedido={pedido} />}

          {fechamento && <Encerramento fechamento={fechamento} />}

          {ofereceBotao && (
            <div className="border-border border-t pt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={movendo}
                  onClick={() => setEncerrando({ publicId: null, nome: null })}
                >
                  Concluir relato
                </Button>

                {/* **Lado a lado, e é assim que tem de ser.** Devolver e encerrar
                    são as duas saídas de um relato que não dá para tocar agora, e
                    esconder uma delas atrás da outra é o que faz "não reproduzi"
                    chegar como recusa. */}
                {podePedir && (
                  <Button size="sm" disabled={pedindo} onClick={() => setPerguntando(true)}>
                    Pedir informação
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-caption text-fg-muted leading-normal">
                Encerrar pede um motivo, e é ele que quem relatou lê. Pedir informação devolve o
                relato sem encerrar.
              </p>
            </div>
          )}

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
            anexosPorFala={anexos.porFala}
            aoExpirar={anexos.refresh}
          />

          <ReportHistory
            projectPublicId={projectPublicId}
            reportPublicId={reportPublicId}
            versao={versao}
          />
        </div>
      )}

      {/* Fica **dentro** do dialogo do relato de proposito: fechar o relato fecha
          os dois, e o dialogo do motivo nunca sobra sozinho na tela apontando para
          um relato que nao esta mais aberto. */}
      {perguntando && (
        <AskInfoDialog
          enviando={pedindo}
          aoConfirmar={(body) => void pedirInformacao(body)}
          aoCancelar={() => setPerguntando(false)}
        />
      )}

      {encerrando && (
        <CloseReportDialog
          coluna={encerrando.nome}
          encerrando={movendo}
          aoConfirmar={(outcome, reason) => {
            // Um diálogo, duas rotas. Com coluna de destino é o movimento que
            // encerra; sem ela, é o botão — e o relato não sai do lugar.
            if (encerrando.publicId === null) void encerrar(outcome, reason)
            else void mover(encerrando.publicId, { Outcome: outcome, Reason: reason })
          }}
          aoCancelar={() => setEncerrando(null)}
        />
      )}
    </Modal>
  )
}

/**
 * O relato está com quem o escreveu, e há um relógio correndo.
 *
 * **É a informação que evita a segunda pergunta.** Sem ela, alguém do time abre o
 * relato dias depois, vê que está parado, e pergunta de novo — e quem está do outro
 * lado recebe duas perguntas sobre a mesma coisa.
 *
 * Os dois prazos aparecem porque são fatos diferentes: um é quando a página passa a
 * avisar, o outro é quando o relato encerra sozinho.
 */
function Devolvido({ pedido }: { pedido: ReportInfoRequestViewModel }) {
  return (
    <section className="rounded-xl border border-warn-border bg-warn-surface p-3.5">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="font-medium text-detail text-warn-fg">Esperando quem relatou</h3>
        {pedido.AskedByName && (
          <span className="text-caption text-warn-fg">pedido por {pedido.AskedByName}</span>
        )}
      </div>

      <p className="text-caption text-warn-fg leading-relaxed">
        A página avisa em {formatDateTime(pedido.WarnAt)}, e o relato encerra como “sem retorno” em{' '}
        {formatDateTime(pedido.CloseAt)} se ninguém responder — e ainda assim poderá ser reaberto.
      </p>
    </section>
  )
}

/**
 * Como o relato terminou, do lado de dentro.
 *
 * **O motivo em corpo, o desfecho em etiqueta** — a mesma ordem da página pública,
 * e pelo mesmo motivo: "Não será feito" sozinho é a recusa sem explicação que este
 * produto existe para não repetir. Aqui ele aparece para o time reler o que foi
 * dito lá fora antes de responder qualquer coisa.
 *
 * **Quem encerrou aparece, e na página pública não.** Do lado de dentro, saber
 * quem decidiu é metade da conversa; do lado de fora, seria expor uma pessoa a
 * quem só quer saber do próprio problema.
 *
 * Nulo não vira frase: o autor falta quando foi o sistema que encerrou, e também
 * logo depois de encerrar pelo movimento, que devolve o resumo sem o nome. Escrever
 * "pelo sistema" nos dois casos estaria errado em um deles.
 */
function Encerramento({ fechamento }: { fechamento: ReportClosureViewModel }) {
  return (
    <section className="rounded-xl border border-border bg-surface-sunken p-3.5">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="font-medium text-detail text-fg">Encerrado</h3>
        <span className="rounded-full border border-border px-2 py-px text-caption text-fg-muted">
          {publicOutcomeLabel(fechamento.Outcome)}
        </span>
        {fechamento.ClosedByName && (
          <span className="text-caption text-fg-muted">por {fechamento.ClosedByName}</span>
        )}
        <time dateTime={fechamento.ClosedAt} className="text-caption text-fg-muted tabular-nums">
          {formatDateTime(fechamento.ClosedAt)}
        </time>
      </div>

      <p className="whitespace-pre-wrap break-words text-detail text-fg leading-relaxed">
        {fechamento.Reason}
      </p>

      <RespostaDoRelator fechamento={fechamento} />
    </section>
  )
}

/**
 * O que quem relatou respondeu — ou o silêncio dele.
 *
 * **É a metade da metáfora que faltava do lado de dentro.** Até aqui o painel só
 * sabia o que o time tinha decidido; esta linha é o time descobrindo se a pessoa
 * concordou. Sem ela, "concluído" e "resolvido" continuariam sendo a mesma coisa
 * para quem olha de dentro.
 *
 * **Os três estados da nota aparecem diferentes**, e não é detalhe de tela: "deu
 * 4", "preferiu não responder" e "não respondeu" são fatos distintos, e mostrá-los
 * iguais aqui ensinaria a lê-los iguais no relatório depois. Juntar os dois últimos
 * daria uma média que parece precisa e não é.
 *
 * **Esperando não é um erro.** A pessoa pode simplesmente não ter voltado ainda, e
 * dizer isso é mais honesto do que deixar a linha em branco.
 */
function RespostaDoRelator({ fechamento }: { fechamento: ReportClosureViewModel }) {
  if (fechamento.ConfirmedAt === null) {
    return (
      <p className="mt-2 text-caption text-fg-muted">
        Quem relatou ainda não respondeu se isso resolveu.
      </p>
    )
  }

  return (
    <p className="mt-2 text-caption text-fg-muted">
      Quem relatou confirmou que resolveu, em {formatDateTime(fechamento.ConfirmedAt)}.{' '}
      {fechamento.Satisfaction !== null && (
        <span className="text-fg">Nota {fechamento.Satisfaction} de 5.</span>
      )}
      {fechamento.SatisfactionDeclined && <span>Preferiu não dar nota.</span>}
      {fechamento.Satisfaction === null && !fechamento.SatisfactionDeclined && (
        <span>Não deu nota.</span>
      )}
    </p>
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
 * A janela de desfazer, enquanto ela está aberta.
 *
 * **Sem isto a espera não serve para nada.** Ela existe para quem moveu o card por
 * engano ter tempo de corrigir antes de a pessoa lá fora ver — e quem moveu por
 * engano só sabe que ainda dá tempo se a tela disser. Uma janela silenciosa é uma
 * janela que só funciona por sorte.
 *
 * **Não há botão de desfazer, e não precisa.** Desfazer é mover de volta, que é o
 * gesto que a pessoa já ia fazer: o agendamento é reescrito a cada movimento, e o
 * que estava a caminho se descarta sozinho ao chegar.
 */
function Esperando({ vence }: { vence: string }) {
  return (
    <span className="rounded-full border border-warn-border bg-warn-surface px-2 py-px text-caption text-warn-fg">
      Quem relatou vê às {formatDateTime(vence)}
    </span>
  )
}

/**
 * Se dá para perguntar alguma coisa a quem relatou.
 *
 * **São três estados, e a tela diz os três.** Aceitou, não aceitou, e — o que se
 * esquece — **não foi perguntado**: o relato que entrou antes de a pergunta
 * existir. Mostrar esse último como "não aceita responder" poria na boca da pessoa
 * uma resposta que ela nunca deu, e é o tipo de erro que ninguém vai conferir.
 *
 * **O sim não aparece**, e é decisão: poder perguntar é o caso comum, e uma
 * etiqueta em todo relato para dizer que está tudo normal vira ruído que se
 * aprende a não ler — e aí a etiqueta que importa passa despercebida junto.
 */
function AceitaDuvidas({ escolha }: { escolha: boolean | null }) {
  if (escolha === true) return null

  return (
    <span className="rounded-full border border-warn-border bg-warn-surface px-2 py-px text-caption text-warn-fg">
      {escolha === false ? 'Não aceita responder dúvidas' : 'Não foi perguntado se responde'}
    </span>
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
