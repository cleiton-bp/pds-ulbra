import { useEffect, useRef, useState } from 'react'
import type {
  PublicOutcome,
  ReportClosureViewModel,
  ReportDetailViewModel,
  ReportInfoRequestViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
  SprintViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { AskInfoDialog } from '@/features/reports/AskInfoDialog'
import {
  CARD_DIALOG_CLASS,
  CARD_DIALOG_WIDTH,
  CardDetailLayout,
  CardDialogTitle,
  DetailRow,
  DetailsBox,
} from '@/features/reports/CardDetailLayout'
import { CardFields } from '@/features/reports/CardFields'
import { CardLinks } from '@/features/reports/CardLinks'
import { CardSubtasks, ParentLink } from '@/features/reports/CardSubtasks'
import { CloseReportDialog } from '@/features/reports/CloseReportDialog'
import { ColumnSelect } from '@/features/reports/ColumnSelect'
import { StatusLozenge, statusTone } from '@/features/reports/cardLook'
import {
  LiveAnnouncer,
  LiveStatusText,
  type SemAoVivo,
  useAnnouncer,
} from '@/features/reports/LiveStatus'
import { ReportAttachments, useReportAttachments } from '@/features/reports/ReportAttachments'
import { ReportComments, useReportComments } from '@/features/reports/ReportComments'
import { ReportHistory } from '@/features/reports/ReportHistory'
import { ReportReopenings } from '@/features/reports/ReportReopenings'
import { ReportTitle } from '@/features/reports/ReportTitle'
import { TeamCardBody } from '@/features/reports/TeamCardBody'
import type { WorkListener } from '@/features/reports/useWorkRealtime'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { CopyButton } from '@/shared/components/CopyButton'
import { Modal } from '@/shared/components/Modal'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { formatDateTime } from '@/shared/lib/datetime'
import { publicOutcomeLabel } from '@/shared/lib/publicOutcomes'

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
  aoMudar,
  aoFechar,
  assinarAvisos,
  semAoVivo = null,
  aoCriarSubtarefa,
  sprints = null,
}: {
  projectPublicId: string
  reportPublicId: string
  /** O que a lista ja sabe, para desenhar na hora. Nulo quando o link foi aberto direto. */
  resumo: ReportSummaryViewModel | null
  /** As colunas da fila, para onde este relato pode ir. */
  colunas: ReportStateCountViewModel[] | null
  /** O card mudou — de coluna, de texto ou de arquivo. A lista se acerta com isto. */
  aoMudar: (report: ReportSummaryViewModel) => void
  aoFechar: () => void
  /** Os avisos do tempo real da tela de Trabalho: outra pessoa mexeu neste card. */
  assinarAvisos?: (ouvinte: WorkListener) => () => void
  /** Por que a tela esta sem atualizacao ao vivo, quando esta — dito tambem aqui dentro. */
  semAoVivo?: SemAoVivo
  /** Uma subtarefa nasceu neste card: a lista e o quadro a poem na tela. */
  aoCriarSubtarefa?: (subtarefa: ReportDetailViewModel) => void
  /** As sprints que nao fecharam, com a sprint ligada: o card mostra a sprint e os pontos. */
  sprints?: SprintViewModel[] | null
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

  // O resumo da lista desenha na hora; quando o detalhe chega, ele vale por cima,
  // campo a campo — e a leitura mais nova. Os dois costumam dizer a mesma coisa, mas
  // nao sempre: o card arquivado em outra aba continua "na tela" no resumo que a
  // lista guardou. Quando nao ha resumo, a tela espera.
  const report: ReportSummaryViewModel | null = detalhe ? { ...resumo, ...detalhe } : resumo
  // A conversa e lida aqui, e nao dentro da caixa de comentarios: os arquivos de uma
  // resposta precisam saber quais falas estao na tela.
  const conversa = useReportComments(projectPublicId, reportPublicId)

  // Uma leitura para o dialogo inteiro: os da criacao vao para baixo do texto, os
  // de uma resposta vao para a conversa, os de uma reabertura vao para junto do
  // motivo dela — quando a fala ou a reabertura esta na tela. O detalhe ou a conversa
  // que falhou nao mostra nada, e os arquivos caem embaixo do texto do relato.
  const anexos = useReportAttachments(
    projectPublicId,
    reportPublicId,
    detalhe
      ? new Set((detalhe.Reopenings ?? []).map((reabertura) => reabertura.PublicId))
      : failed
        ? new Set()
        : null,
    conversa.falas,
  )

  const contexts = detalhe?.Contexts ?? null

  // Guarda o relato movido para a tela nao voltar a mostrar a coluna antiga: o
  // resumo veio da lista, e ela so e avisada depois.
  const [movido, setMovido] = useState<ReportSummaryViewModel | null>(null)
  const [movendo, setMovendo] = useState(false)

  // Sobe a cada acao que vira evento. A linha do tempo le isto e busca de novo —
  // sem ele, mover ou comentar deixaria o historico mostrando o estado anterior
  // na frente de quem acabou de agir.
  const [versao, setVersao] = useState(0)

  // Sobe a cada resposta de uma acao desta aba. A releitura ao vivo que estava no ar
  // quando ela chegou pode ter sido lida antes dela, e nao passa por cima — le de novo.
  const acoes = useRef(0)

  const atual = movido ?? report

  /**
   * O fim do relato, quando ja houve um.
   *
   * **E estado proprio, e nao `detalhe.Closure`.** Encerrar pelo movimento devolve
   * o resumo, que nao carrega o fechamento — sem isto, a tela continuaria
   * oferecendo "Concluir" um segundo depois de encerrar, e so pararia quando
   * alguem fechasse e abrisse de novo. Abrir o detalhe outra vez nao serve: **abrir
   * grava** um evento de leitura. (A releitura que nao grava, `refreshReport`, e a do
   * tempo real: traz o que outra pessoa mudou.)
   */
  const [fechamento, setFechamento] = useState<ReportClosureViewModel | null>(null)

  /**
   * O pedido de informacao aberto, e se da para abrir um.
   *
   * **Estado proprio, pelo mesmo motivo do fechamento**: pedir devolve o relato
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
    // Ja encerrado so anda: a API nao encerra de novo, e pedir motivo aqui cobraria
    // uma decisao que ja foi tomada.
    if (colunaQueEncerra?.StatePublicId === statePublicId && fechamento === null) {
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
      acoes.current += 1
      setMovido(salvo)
      aoMudar(salvo)
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
          // Quem relatou ainda nao viu: acabou de encerrar.
          ConfirmedAt: null,
          Satisfaction: null,
          SatisfactionDeclined: false,
        })
      // Sair da coluna que encerra desfaz o encerramento que quem relatou ainda nao
      // confirmou: a API faz isso no mesmo movimento, e a tela acompanha. Chegar a
      // ela com o fechamento valendo nao desfaz nada, e no encerramento por botao
      // mover e so mover.
      else if (colunaQueEncerra !== null && colunaQueEncerra.StatePublicId !== statePublicId)
        setFechamento((anterior) => (anterior?.ConfirmedAt === null ? null : anterior))
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
      acoes.current += 1
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
   * Devolve o relato pedindo informacao.
   *
   * **Nao encerra nada**, e e essa a diferenca que da nome ao passo: quem precisa
   * de contexto e quem recusa de fato tomaram decisoes opostas, e chegando iguais
   * do outro lado a pessoa entende que acabou e para de responder.
   */
  async function pedirInformacao(body: string) {
    if (pedindo) return

    setPedindo(true)

    try {
      const aberto = await projectReportService.askInfo(projectPublicId, reportPublicId, {
        Body: body,
      })

      acoes.current += 1
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

  /**
   * Arquivar o relato. **Aberto, ele encerra junto**: o dialogo e o do encerramento,
   * com desfecho e motivo, porque quem relatou le — e a partir dali reabre ou
   * finaliza. Ja encerrado, so sai da tela, e a confirmacao e simples.
   *
   * Quem decide e o `fechamento` da tela, e nao o `ArchiveCloses` do detalhe: mover
   * para a coluna que encerra, ou para fora dela, muda o fechamento sem buscar o
   * detalhe de novo — e o pedido montado com o valor da abertura levaria um 400.
   */
  const [arquivando, setArquivando] = useState<'encerra' | 'so-arquiva' | null>(null)
  const [mexendoNoArquivo, setMexendoNoArquivo] = useState(false)

  /**
   * **Ao vivo**: outra pessoa mexeu neste card (ou na configuracao do projeto, ou a
   * conexao voltou e pode ter perdido avisos), e tudo na tela se acerta — a coluna, os
   * campos, o encerramento, a conversa, os anexos e a historia.
   *
   * O detalhe e relido **sem gravar leitura** (`refreshReport`): a leitura foi contada
   * ao abrir, e cada aviso viraria uma leitura que ninguem fez. O que a pessoa esta
   * escrevendo — comentario, titulo, descricao — fica: cada caixa guarda o proprio
   * rascunho, e a releitura nao passa por ele. A lista e o quadro atras se acertam pelo
   * proprio aviso; daqui nao vai `aoMudar`.
   */
  const aoVivo = useRef<() => Promise<void>>(async () => {})
  const releituras = useRef(0)
  // Sobe quando a configuracao do projeto pode ter mudado: as listas de escolha dos
  // campos do card sao lidas de novo.
  const [configuracao, setConfiguracao] = useState(0)
  // Quem usa leitor de tela fica sabendo que outra pessoa mudou o card — quando a
  // releitura chega, e nao antes.
  const [anuncio, anunciar] = useAnnouncer()
  const contarAoChegar = useRef(false)
  aoVivo.current = async () => {
    const minha = generation.current
    const esta = ++releituras.current
    const acoesAntes = acoes.current
    conversa.revalidate()
    anexos.revalidate()
    setVersao((n) => n + 1)

    try {
      const aberto = await projectReportService.refreshReport(projectPublicId, reportPublicId)
      // Outro relato aberto, ou uma releitura mais nova no ar: esta ja nao vale.
      if (minha !== generation.current || esta !== releituras.current) return
      if (acoes.current !== acoesAntes) {
        void aoVivo.current()
        return
      }
      setDetalhe(aberto)
      setFechamento(aberto.Closure)
      setPedido(aberto.InfoRequest)
      setPodePedir(aberto.CanAskInfo)
      setMovido(aberto)
      if (contarAoChegar.current) anunciar('Este card foi atualizado.')
      contarAoChegar.current = false
    } catch {
      // Fica o que esta na tela; o proximo aviso tenta de novo.
    }
  }

  useEffect(() => {
    if (!assinarAvisos) return
    return assinarAvisos((evento) => {
      if (evento.kind === 'access-lost') return
      if (evento.kind === 'card' && evento.notice.ReportPublicId !== reportPublicId) return
      if (evento.kind === 'card') contarAoChegar.current = true
      else setConfiguracao((n) => n + 1)
      void aoVivo.current()
    })
  }, [assinarAvisos, reportPublicId])

  /**
   * As subtarefas do card aberto. A que nasce entra na tela de Trabalho, e o pai e
   * relido sem gravar leitura — o progresso dele mudou, na frente do card tambem.
   */
  const subtarefas = (card: ReportSummaryViewModel) => (
    <CardSubtasks
      projectPublicId={projectPublicId}
      card={card}
      colunas={colunas}
      versao={versao}
      aoCriar={(nova) => {
        aoCriarSubtarefa?.(nova)
        projectReportService
          .refreshReport(projectPublicId, reportPublicId)
          .then(receber)
          .catch(() => {})
      }}
    />
  )

  /**
   * Os vinculos do card aberto. Marcar como duplicado pode levar este card para o
   * arquivo, e desfazer pode trazer de volta: o card e relido sem gravar leitura.
   */
  const vinculos = (card: ReportSummaryViewModel) => (
    <CardLinks
      projectPublicId={projectPublicId}
      card={card}
      colunas={colunas}
      versao={versao}
      aoMudar={() => {
        projectReportService
          .refreshReport(projectPublicId, reportPublicId)
          .then(receber)
          .catch(() => {})
      }}
    />
  )

  /** A resposta de uma acao que devolve o card aberto: tudo na tela passa a ela. */
  function receber(aberto: ReportDetailViewModel) {
    acoes.current += 1
    setDetalhe(aberto)
    setFechamento(aberto.Closure)
    setPedido(aberto.InfoRequest)
    setPodePedir(aberto.CanAskInfo)
    setMovido(aberto)
    aoMudar(aberto)
    setVersao((n) => n + 1)
  }

  async function mudarArquivo(
    arquivar: boolean,
    fechamento_?: { Outcome: PublicOutcome; Reason: string },
  ) {
    if (mexendoNoArquivo) return
    setMexendoNoArquivo(true)

    try {
      const aberto = await projectReportService.setArchived(projectPublicId, reportPublicId, {
        Archived: arquivar,
        ...fechamento_,
      })
      receber(aberto)
      setArquivando(null)
      toast.done(
        arquivar ? `#${aberto.Number} arquivado.` : `#${aberto.Number} de volta ao Trabalho.`,
      )
    } catch (falha) {
      // O dialogo do motivo fica aberto: o texto escrito continua la para tentar de novo.
      toast.error(describeError(falha))
    } finally {
      setMexendoNoArquivo(false)
    }
  }

  const ehDoTime = report?.Kind === 'Team'
  const arquivado = atual?.ArchivedAt != null

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar()
      }}
      title={<CardDialogTitle card={report} />}
      closeButton
      width={CARD_DIALOG_WIDTH}
      className={CARD_DIALOG_CLASS}
      // O card pode ter trocado de lugar enquanto estava aberto — outra pessoa o
      // moveu —, e quem o abriu saiu da pagina: o foco vai para ele no lugar novo, ou,
      // se ele saiu da tela, para a area de Trabalho.
      fallbackFocus={() =>
        document.querySelector<HTMLElement>(`a[href$="/reports/${reportPublicId}"]`) ??
        document.querySelector<HTMLElement>('[data-work-area]')
      }
    >
      <LiveStatusText estado={semAoVivo} />
      <LiveAnnouncer anuncio={anuncio} />
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

      {report && atual && ehDoTime && (
        <TeamCardBody
          projectPublicId={projectPublicId}
          reportPublicId={reportPublicId}
          sprints={sprints}
          card={atual}
          detalhe={detalhe}
          failed={failed}
          colunas={colunas}
          movendo={movendo}
          conversa={conversa}
          versao={versao}
          aoMover={(statePublicId) => void mover(statePublicId)}
          aoSalvo={receber}
          aoComentar={() => setVersao((n) => n + 1)}
          antes={atual.Parent ? <ParentLink parent={atual.Parent} /> : null}
          depois={
            <>
              {atual.Parent ? null : subtarefas(atual)}
              {vinculos(atual)}
            </>
          }
        />
      )}

      {report && !ehDoTime && (
        <CardDetailLayout
          cabeca={
            <>
              {/* O titulo do time, e o de quem relatou, que nunca muda — e logo
                  abaixo o texto dela, que continua sendo o que ela escreveu. */}
              <ReportTitle
                projectPublicId={projectPublicId}
                reportPublicId={reportPublicId}
                card={atual ?? report}
                aoMudar={receber}
              />

              <p className="whitespace-pre-wrap break-words text-body text-fg leading-relaxed">
                {report.Text}
              </p>

              <ReportAttachments
                anexos={anexos.daCriacao}
                failed={anexos.failed}
                onReload={anexos.reload}
                onExpired={anexos.refresh}
              />

              {/* Antes do encerramento: as reaberturas ja aconteceram, e o fechamento
                  que vale, quando ha um, e o fim mais recente. Vem do detalhe, que encerrar e pedir
                  informacao tambem devolvem — por isso a lista nao some da tela
                  depois dessas acoes. */}
              <ReportReopenings
                reaberturas={detalhe?.Reopenings ?? []}
                anexosPorReabertura={anexos.porReabertura}
                aoExpirar={anexos.refresh}
              />

              {pedido && <Devolvido pedido={pedido} />}

              {fechamento && <Encerramento fechamento={fechamento} />}

              {subtarefas(atual ?? report)}
              {vinculos(atual ?? report)}
            </>
          }
          lado={
            <>
              <div className="flex flex-col items-start gap-2">
                {/* Onde ele esta na fila, e o controle que o move. Arquivado nao se
                    move: o seletor da lugar a etiqueta, e mover pede desarquivar. */}
                {arquivado ? (
                  <span className="rounded-full border border-warn-border bg-warn-surface px-2 py-px text-caption text-warn-fg">
                    Arquivado
                  </span>
                ) : colunas && colunas.length > 0 ? (
                  <ColumnSelect
                    colunas={colunas}
                    atual={atual?.StatePublicId ?? null}
                    disabled={movendo}
                    tone={statusTone(atual?.StatePublicId ?? null, colunas)}
                    aoEscolher={escolher}
                  />
                ) : (
                  atual?.StateName && (
                    <StatusLozenge
                      name={atual.StateName}
                      tone={statusTone(atual.StatePublicId, colunas)}
                    />
                  )
                )}

                {/* O outro lado. Fica junto do controle que move de proposito: e aqui
                    que alguem decide, e a consequencia la fora precisa estar a vista
                    no momento da decisao — nao numa tela que se abre depois.

                    Vem de `atual`, que e a resposta do proprio movimento. Abrir o
                    detalhe de novo **grava um evento de leitura**, e isso mediria
                    cliques do time em vez de leituras. */}
                {atual && <LadoDeFora etapa={atual.PublicStageLabel} />}

                <div className="flex flex-wrap gap-1.5">
                  {/* **Quem abre um relato para responder precisa saber se esta
                      falando em publico.** A decisao se toma na Moderacao; aqui e so
                      o estado, porque descobrir depois de escrever e descobrir tarde.

                      "Liberado" e nao "publico": o projeto tambem precisa estar num
                      nivel publico, e esta tela nao sabe disso. */}
                  {detalhe?.ModerationState === 'Approved' && (
                    <span className="rounded-md border border-warn-border bg-warn-surface px-1.5 py-0.5 text-caption text-warn-fg">
                      Liberado para o público
                    </span>
                  )}

                  {/* A escolha de quem relatou, **antes** de alguem tentar perguntar.
                      Descobrir depois — ao esbarrar numa recusa — faria a pessoa do
                      time escrever a pergunta para so entao saber que ela nao vai
                      sair. */}
                  {atual && <AceitaDuvidas escolha={atual.AcceptsQuestions} />}

                  {atual?.PublicStageDueAt && <Esperando vence={atual.PublicStageDueAt} />}
                </div>
              </div>

              {ofereceBotao && !arquivado && (
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={movendo}
                      onClick={() => setEncerrando({ publicId: null, nome: null })}
                    >
                      Concluir relato
                    </Button>

                    {/* **Lado a lado, e e assim que tem de ser.** Devolver e encerrar
                        sao as duas saidas de um relato que nao da para tocar agora, e
                        esconder uma delas atras da outra e o que faz "nao reproduzi"
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

              <DetailsBox>
                <CardFields
                  projectPublicId={projectPublicId}
                  reportPublicId={reportPublicId}
                  card={atual ?? report}
                  aoMudar={receber}
                  configuracao={configuracao}
                  sprints={sprints}
                />

                <dl className="flex flex-col gap-1.5 border-border border-t pt-3">
                  {/* O protocolo e o de quem relatou (o numero, do time, esta no titulo
                      do dialogo), e e o que se copia para responder. */}
                  <DetailRow
                    label="Protocolo"
                    value={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <code className="font-mono">{report.TrackingCode}</code>
                        <CopyButton
                          value={report.TrackingCode ?? ''}
                          label="Copiar protocolo"
                          size="sm"
                        />
                      </span>
                    }
                  />
                  <DetailRow
                    label="Criado"
                    value={<span className="tabular-nums">{formatDateTime(report.CreatedAt)}</span>}
                  />
                </dl>

                <section className="border-border border-t pt-3">
                  <h4 className="mb-2 font-medium text-caption text-fg-muted">Onde aconteceu</h4>

                  <dl className="flex flex-col gap-1.5">
                    <DetailRow label="Página" value={report.Route} />
                    <DetailRow label="Site" value={report.Origin} />

                    {failed && (
                      <p className="mt-1 text-caption text-fg-muted">
                        O resto do contexto não carregou. O texto do relato é o que a pessoa
                        escreveu, e está completo.
                      </p>
                    )}

                    {!failed && contexts === null && (
                      <>
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </>
                    )}

                    {contexts?.map((context) => (
                      <DetailRow
                        key={context.Key}
                        label={contextLabel(context.Key)}
                        value={context.Value}
                      />
                    ))}
                  </dl>

                  {contexts?.length === 0 && !failed && (
                    <p className="mt-1 text-caption text-fg-muted">
                      A ferramenta não enviou mais nada além do endereço.
                    </p>
                  )}
                </section>
              </DetailsBox>

              {/* Arquivar so aparece com a regra do ciclo ligada (`CanArchive`), e
                  desarquivar sempre que estiver arquivado — inclusive com a regra
                  desligada depois: o que saiu da tela nao pode ficar preso fora dela. */}
              {(arquivado || detalhe?.CanArchive) && (
                <div>
                  {arquivado ? (
                    <Button
                      size="sm"
                      disabled={mexendoNoArquivo}
                      onClick={() => void mudarArquivo(false)}
                    >
                      Desarquivar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="quiet"
                      disabled={mexendoNoArquivo}
                      onClick={() => setArquivando(fechamento === null ? 'encerra' : 'so-arquiva')}
                    >
                      Arquivar relato
                    </Button>
                  )}
                  <p className="mt-1.5 text-caption text-fg-muted leading-normal">
                    {arquivado
                      ? atual?.DuplicateOf
                        ? `Duplicado de #${atual.DuplicateOf.Number}: quem relatou acompanha o original. Desarquivar desfaz o vínculo, e o relato volta a andar sozinho.`
                        : 'Arquivado: dá para ler e comentar entre o time. Para mover ou escrever a quem relatou, desarquive.'
                      : fechamento === null
                        ? 'Arquivar encerra o relato com um motivo, que quem relatou lê e a partir do qual pode reabrir ou finalizar.'
                        : 'Quem relatou já recebeu o motivo do encerramento. Arquivar só tira o relato da tela de Trabalho.'}
                  </p>
                </div>
              )}
            </>
          }
          atividade={
            <>
              <ReportComments
                projectPublicId={projectPublicId}
                reportPublicId={reportPublicId}
                conversa={conversa}
                aoComentar={() => setVersao((n) => n + 1)}
                anexosPorFala={anexos.porFala}
                aoExpirar={anexos.refresh}
                paraQuemRelatou={arquivado ? 'ler' : 'escrever'}
              />

              <ReportHistory
                projectPublicId={projectPublicId}
                reportPublicId={reportPublicId}
                versao={versao}
              />
            </>
          }
        />
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

      {arquivando === 'encerra' && (
        <CloseReportDialog
          coluna={null}
          arquivando
          maisLeitores={atual?.DuplicateReporters ?? 0}
          encerrando={mexendoNoArquivo}
          aoConfirmar={(outcome, reason) =>
            void mudarArquivo(true, { Outcome: outcome, Reason: reason })
          }
          aoCancelar={() => setArquivando(null)}
        />
      )}

      <ConfirmDialog
        open={arquivando === 'so-arquiva'}
        onOpenChange={(aberto) => {
          if (!aberto) setArquivando(null)
        }}
        title={report ? `Arquivar #${report.Number}` : 'Arquivar'}
        description="O relato sai da tela de Trabalho. Quem relatou já recebeu o motivo do encerramento; se reabrir, ele volta sozinho."
        confirmLabel="Arquivar"
        onConfirm={() => mudarArquivo(true)}
      />

      {encerrando && (
        <CloseReportDialog
          coluna={encerrando.nome}
          maisLeitores={atual?.DuplicateReporters ?? 0}
          encerrando={movendo}
          aoConfirmar={(outcome, reason) => {
            // Um dialogo, duas rotas. Com coluna de destino e o movimento que
            // encerra; sem ela, e o botao — e o relato nao sai do lugar.
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
 * O relato esta com quem o escreveu, e ha um relogio correndo.
 *
 * **E a informacao que evita a segunda pergunta.** Sem ela, alguem do time abre o
 * relato dias depois, ve que esta parado, e pergunta de novo — e quem esta do outro
 * lado recebe duas perguntas sobre a mesma coisa.
 *
 * Os dois prazos aparecem porque sao fatos diferentes: um e quando a pagina passa a
 * avisar, o outro e quando o relato encerra sozinho.
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
 * **O motivo em corpo, o desfecho em etiqueta** — a mesma ordem da pagina publica,
 * e pelo mesmo motivo: "Nao sera feito" sozinho e a recusa sem explicacao que este
 * produto existe para nao repetir. Aqui ele aparece para o time reler o que foi
 * dito la fora antes de responder qualquer coisa.
 *
 * **Quem encerrou aparece, e na pagina publica nao.** Do lado de dentro, saber
 * quem decidiu e metade da conversa; do lado de fora, seria expor uma pessoa a
 * quem so quer saber do proprio problema.
 *
 * Nulo nao vira frase: o autor falta quando foi o sistema que encerrou, e tambem
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
 * O que quem relatou respondeu — ou o silencio dele.
 *
 * **E a metade da metafora que faltava do lado de dentro.** Ate aqui o painel so
 * sabia o que o time tinha decidido; esta linha e o time descobrindo se a pessoa
 * concordou. Sem ela, "concluido" e "resolvido" continuariam sendo a mesma coisa
 * para quem olha de dentro.
 *
 * **Os tres estados da nota aparecem diferentes**, e nao e detalhe de tela: "deu
 * 4", "preferiu nao responder" e "nao respondeu" sao fatos distintos, e mostra-los
 * iguais aqui ensinaria a le-los iguais no relatorio depois. Juntar os dois ultimos
 * daria uma media que parece precisa e nao e.
 *
 * **Esperando nao e um erro.** A pessoa pode simplesmente nao ter voltado ainda, e
 * dizer isso e mais honesto do que deixar a linha em branco.
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
 * A janela de desfazer, enquanto ela esta aberta.
 *
 * **Sem isto a espera nao serve para nada.** Ela existe para quem moveu o card por
 * engano ter tempo de corrigir antes de a pessoa la fora ver — e quem moveu por
 * engano so sabe que ainda da tempo se a tela disser. Uma janela silenciosa e uma
 * janela que so funciona por sorte.
 *
 * **Nao ha botao de desfazer, e nao precisa.** Desfazer e mover de volta, que e o
 * gesto que a pessoa ja ia fazer: o agendamento e reescrito a cada movimento, e o
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
 * Se da para perguntar alguma coisa a quem relatou.
 *
 * **Sao tres estados, e a tela diz os tres.** Aceitou, nao aceitou, e — o que se
 * esquece — **nao foi perguntado**: o relato que entrou antes de a pergunta
 * existir. Mostrar esse ultimo como "nao aceita responder" poria na boca da pessoa
 * uma resposta que ela nunca deu, e e o tipo de erro que ninguem vai conferir.
 *
 * **O sim nao aparece**, e e decisao: poder perguntar e o caso comum, e uma
 * etiqueta em todo relato para dizer que esta tudo normal vira ruido que se
 * aprende a nao ler — e ai a etiqueta que importa passa despercebida junto.
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
 * Onde quem relatou ve este relato.
 *
 * **Nulo nao diz por que** — pode ser coluna fora do mapa, projeto sem jornada, ou
 * relato que entrou antes de a jornada existir. A frase cobre os tres, porque
 * distinguir exigiria um campo que ficaria desatualizado no primeiro movimento, e
 * aviso errado e pior que aviso nenhum. Quem precisa da diferenca a encontra em
 * Etapas publicas, que lista os estados sem destino.
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
