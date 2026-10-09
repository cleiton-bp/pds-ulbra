import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  type InternalCommentViewModel,
  MAX_COMMENT_LENGTH,
  type PanelAttachmentViewModel,
  type ReportCommentsViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { useCardDraft, useDiscardQuestion } from '@/features/reports/cardDrafts'
import { CommentBody, MentionTextarea } from '@/features/reports/MentionTextarea'
import { type ChosenMention, decodeMentions, encodeMentions } from '@/features/reports/mentions'
import { AVISO_DE_ARQUIVO, toPanelGalleryItem } from '@/features/reports/ReportAttachments'
import { AttachmentGallery } from '@/shared/components/AttachmentGallery'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { type AsyncResource, useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { cn } from '@/shared/lib/cn'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'

/** A conversa de um relato, e as falas publicas que ela pos na tela. */
export interface ReportConversation extends AsyncResource<ReportCommentsViewModel> {
  /**
   * As falas publicas que a conversa mostra, pelo identificador. **Nula enquanto
   * carrega; vazia se falhou.** E o que os arquivos de uma resposta consultam para
   * saber se a fala deles esta na tela.
   */
  falas: ReadonlySet<string> | null
}

/**
 * Quanto a resposta a quem relatou espera antes de sair. **E o "mandei cedo demais"**:
 * o comentario publico nao se corrige — ele sai da empresa —, e os segundos de espera,
 * com "Desfazer" na tela, sao a chance de voltar atras antes de a pessoa ler. A mesma
 * ideia do atraso que o projeto ja tem para a etapa publica.
 */
const ESPERA_DA_RESPOSTA_MS = 5000

/**
 * A conversa do relato, lida uma vez para o dialogo inteiro.
 *
 * **Mora fora da caixa de comentarios, e e por causa dos arquivos.** O arquivo de uma
 * resposta vai embaixo da fala que o trouxe — e, quando ela nao esta na tela, embaixo
 * do relato, em vez de sumir: a conversa que nao carregou, a resposta que chegou
 * depois de o dialogo abrir. Para isso quem monta o dialogo precisa saber quais falas
 * a caixa mostra, e a leitura sobe para ele. Ver `useReportAttachments`.
 */
export function useReportComments(
  projectPublicId: string,
  reportPublicId: string,
): ReportConversation {
  const leitura = useAsyncResource(
    useCallback(
      () => projectReportService.listComments(projectPublicId, reportPublicId),
      [projectPublicId, reportPublicId],
    ),
  )

  const falas = leitura.data
    ? new Set(leitura.data.Public.map((fala) => fala.PublicId))
    : leitura.failed
      ? new Set<string>()
      : null

  return { ...leitura, falas }
}

/**
 * Os dois comentarios de um relato.
 *
 * **A diferenca precisa ser obvia, e o destaque vai no que sai.** O erro caro nao
 * e escrever no lugar errado por engano de clique: e escrever um pensamento
 * interno — "isso e culpa do fornecedor", "nao vamos consertar" — dentro da caixa
 * que a pessoa que relatou vai ler. Por isso e a caixa **publica** que tem moldura
 * de atencao, e nao a interna: o aviso fica onde o estrago acontece.
 *
 * **Sao dois campos e dois botoes, nunca um com um seletor.** Um seletor de
 * visibilidade seria o sinalizador que as duas tabelas da API existem para evitar,
 * de volta pela porta da tela: bastaria ele estar no valor errado no momento do
 * envio.
 *
 * **E a tela diz onde a pessoa le.** Quem escreve na caixa publica precisa saber que
 * aquilo sai da empresa: a pessoa le na pagina de acompanhamento, junto das proprias
 * respostas.
 *
 * **O comentario entre o time se corrige e se apaga**, por quem o escreveu: o "@" na
 * pessoa errada e o erro de digitacao nao ficam para sempre. **O de quem relatou nao**
 * — ele sai da empresa; o que ha e a espera com "Desfazer" antes de ele sair.
 */
export function ReportComments({
  projectPublicId,
  reportPublicId,
  conversa,
  aoComentar,
  anexosPorFala = new Map(),
  aoExpirar = () => {},
  paraQuemRelatou = 'escrever',
}: {
  projectPublicId: string
  reportPublicId: string
  /**
   * O que fazer com a caixa de quem relatou. **O card do time nao tem ninguem do
   * lado de fora**, e a caixa nem aparece; no relato arquivado ela fica para ler, e
   * escrever pede desarquivar.
   */
  paraQuemRelatou?: 'escrever' | 'ler' | 'nenhum'
  /** A leitura da conversa, feita por quem monta o dialogo — ver `useReportComments`. */
  conversa: ReportConversation
  /** Avisa quem monta a tela de que o historico mudou. */
  aoComentar: () => void
  /** Os arquivos que vieram numa resposta, pela fala que os trouxe. */
  anexosPorFala?: Map<string, PanelAttachmentViewModel[]>
  /** Um endereco de arquivo venceu: quem monta a tela rele. */
  aoExpirar?: () => void
}) {
  const { data: comentarios, loading, failed, reload, revalidate } = conversa

  // O que esta aba gravou fica guardado a parte e entra na lista que chegar: a
  // releitura ao vivo continua trocando a conversa, e uma releitura pedida antes do
  // comentario gravar nao o tira da tela. A correcao e o apagado, do mesmo jeito.
  const [proprios, setProprios] = useState<ReportCommentsViewModel>(SEM_PROPRIOS)
  const [corrigidos, setCorrigidos] = useState<ReadonlyMap<string, InternalCommentViewModel>>(
    () => new Map(),
  )
  const [apagados, setApagados] = useState<ReadonlySet<string>>(() => new Set())
  const atual = useMemo(
    () => juntar(comentarios, proprios, corrigidos, apagados),
    [comentarios, proprios, corrigidos, apagados],
  )

  // A fala que chega ao vivo entra acima do campo, e o empurra para baixo: quem esta
  // escrevendo — no celular, com o teclado aberto — perdia o campo de vista. Ele volta
  // para a tela, e o rascunho e o foco ficam onde estavam.
  const secao = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (!atual) return
    const ativo = document.activeElement
    if (ativo instanceof HTMLTextAreaElement && secao.current?.contains(ativo))
      ativo.scrollIntoView?.({ block: 'nearest' })
  }, [atual])

  return (
    <section ref={secao} className="border-border border-t pt-4">
      {failed && (
        <div className="mb-3">
          <p className="mb-2.5 text-detail text-fg-muted leading-relaxed">
            Não deu para carregar os comentários. Nada se perdeu: a falha foi ao consultar.
          </p>
          <Button size="sm" onClick={reload}>
            Tentar de novo
          </Button>
        </div>
      )}

      {loading && <Skeleton className="mb-3 h-3 w-2/3" />}

      <Caixa
        titulo="Entre o time"
        explicacao="Só quem tem acesso a este painel lê. Não sai daqui. Escreva @ para chamar alguém do time — a pessoa é avisada no sino."
        destaque={false}
        mencoesNoProjeto={projectPublicId}
        comentarios={atual?.Internal ?? []}
        aoEnviar={async (body) => {
          const salvo = await projectReportService.addInternalComment(
            projectPublicId,
            reportPublicId,
            { Body: body },
          )
          setProprios((antes) => ({ ...antes, Internal: [...antes.Internal, salvo] }))
          aoComentar()
        }}
        aoCorrigir={async (id, body) => {
          const salvo = await projectReportService.editInternalComment(
            projectPublicId,
            reportPublicId,
            id,
            { Body: body },
          )
          setCorrigidos((antes) => new Map(antes).set(salvo.PublicId, salvo))
          revalidate()
        }}
        aoApagar={async (id) => {
          await projectReportService.deleteInternalComment(projectPublicId, reportPublicId, id)
          setApagados((antes) => new Set(antes).add(id))
          revalidate()
        }}
      />

      {paraQuemRelatou !== 'nenhum' && (
        <Caixa
          titulo="Para quem relatou"
          explicacao={
            paraQuemRelatou === 'ler'
              ? 'O relato está arquivado. Para escrever a quem relatou, desarquive antes.'
              : 'Escrito para a pessoa que abriu o relato. Ela lê na página de acompanhamento, junto das próprias respostas.'
          }
          destaque
          podeEscrever={paraQuemRelatou === 'escrever'}
          esperaAntesDeEnviar
          comentarios={atual?.Public ?? []}
          // **So a caixa publica recebe arquivo.** A interna nem tem por onde: arquivo
          // so vem numa resposta de quem relatou, e quem relatou nao escreve no
          // interno. E a estrutura que garante, e nao um filtro que alguem esqueca.
          anexosPorFala={anexosPorFala}
          aoExpirar={aoExpirar}
          aoEnviar={async (body) => {
            const salvo = await projectReportService.addPublicComment(
              projectPublicId,
              reportPublicId,
              { Body: body },
            )
            setProprios((antes) => ({ ...antes, Public: [...antes.Public, salvo] }))
            aoComentar()
          }}
        />
      )}
    </section>
  )
}

const SEM_PROPRIOS: ReportCommentsViewModel = { Internal: [], Public: [] }

/**
 * A conversa lida, com o que esta aba gravou e a leitura ainda nao trouxe no fim — a
 * leitura que nao o trouxe foi pedida antes dele, entao tudo nela e mais antigo. O
 * comentario corrigido aqui vale pela correcao ate a leitura trazer uma mais nova; o
 * apagado aqui sai, mesmo da leitura que ainda nao sabia.
 */
function juntar(
  lida: ReportCommentsViewModel | null,
  proprios: ReportCommentsViewModel,
  corrigidos: ReadonlyMap<string, InternalCommentViewModel>,
  apagados: ReadonlySet<string>,
): ReportCommentsViewModel | null {
  if (!lida) return null
  const faltando = <T extends { PublicId: string }>(dela: T[], meus: T[]) => {
    const tem = new Set(dela.map((fala) => fala.PublicId))
    return [...dela, ...meus.filter((fala) => !tem.has(fala.PublicId))]
  }
  const corrigido = (fala: InternalCommentViewModel) => {
    const minha = corrigidos.get(fala.PublicId)
    return minha && (fala.EditedAt ?? '') <= (minha.EditedAt ?? '') ? minha : fala
  }
  return {
    ...lida,
    Internal: faltando(lida.Internal, proprios.Internal)
      .filter((fala) => !apagados.has(fala.PublicId))
      .map(corrigido),
    Public: faltando(lida.Public, proprios.Public),
  }
}

interface Comentario {
  PublicId: string
  AuthorName: string | null
  Body: string
  CreatedAt: string
  /**
   * So o comentario publico tem este campo, e so ele pode ser verdadeiro: quem
   * relatou nao escreve no interno, e nunca vai escrever.
   */
  FromReporter?: boolean
  /** So o interno: quando foi corrigido, e se e de quem le. */
  EditedAt?: string | null
  IsYours?: boolean
}

/**
 * Uma das duas caixas. Recebe a lista e o que fazer ao enviar — e **nao** recebe
 * um tipo: quem decide qual e qual e quem a monta, uma vez, no arquivo acima.
 */
function Caixa({
  titulo,
  explicacao,
  destaque,
  podeEscrever = true,
  esperaAntesDeEnviar = false,
  comentarios,
  aoEnviar,
  aoCorrigir,
  aoApagar,
  anexosPorFala,
  aoExpirar = () => {},
  mencoesNoProjeto,
}: {
  titulo: string
  explicacao: string
  destaque: boolean
  /**
   * O projeto, na caixa que menciona — so a de dentro: a de fora e lida por quem
   * relatou, e mencao ali seria mostrar o time a quem esta de fora.
   */
  mencoesNoProjeto?: string
  /** Falso deixa so a leitura: a conversa continua na tela, e o campo sai. */
  podeEscrever?: boolean
  /** A resposta a quem relatou espera uns segundos, com "Desfazer", antes de sair. */
  esperaAntesDeEnviar?: boolean
  comentarios: Comentario[]
  aoEnviar: (body: string) => Promise<void>
  /** Corrigir e apagar: so na caixa de dentro, e so no comentario de quem le. */
  aoCorrigir?: (id: string, body: string) => Promise<void>
  aoApagar?: (id: string) => Promise<void>
  anexosPorFala?: Map<string, PanelAttachmentViewModel[]>
  aoExpirar?: () => void
}) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Quem foi escolhido na lista do "@": no envio, o "@Nome" que ainda esta no texto
  // vira a marca que diz quem e.
  const [mencionados, setMencionados] = useState<ChosenMention[]>([])
  const [corrigindo, setCorrigindo] = useState<string | null>(null)
  const [apagando, setApagando] = useState<Comentario | null>(null)
  const dica = useId()

  // O que esta escrito e nao foi enviado: fechar o card pergunta antes de descartar.
  const area = useRef<HTMLDivElement>(null)
  useCardDraft({ sujo: podeEscrever && texto.trim().length > 0 }, area)

  /** O comentario entre o time: sai na hora, e o campo so se limpa depois de gravado. */
  async function gravarAgora(escrito: string) {
    const body = mencoesNoProjeto ? encodeMentions(escrito, mencionados) : escrito

    setEnviando(true)
    setErro(null)

    try {
      await aoEnviar(body)
      setTexto('')
      setMencionados([])
    } catch (failure) {
      setErro(describeError(failure))
    } finally {
      setEnviando(false)
    }
  }

  /** A resposta a quem relatou, depois da espera. A falha devolve o texto ao campo. */
  async function gravarResposta(body: string) {
    setEnviando(true)
    setErro(null)

    try {
      await aoEnviar(body)
    } catch (failure) {
      // O texto volta ao campo: quem escreveu tenta de novo sem reescrever.
      setTexto((agora) => (agora.trim().length === 0 ? body : agora))
      setErro(describeError(failure))
    } finally {
      setEnviando(false)
    }
  }

  // A resposta a quem relatou que esta esperando para sair. O texto ja saiu do campo,
  // e volta para ele no "Desfazer".
  const [aSair, setASair] = useState<string | null>(null)
  const pendente = useRef<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: o gatilho e a resposta a sair; `gravarResposta` muda a cada desenho.
  useEffect(() => {
    pendente.current = aSair
    if (aSair === null) return
    const espera = setTimeout(() => {
      pendente.current = null
      setASair(null)
      void gravarResposta(aSair)
    }, ESPERA_DA_RESPOSTA_MS)
    return () => clearTimeout(espera)
  }, [aSair])

  // Fechar o card com a resposta esperando nao a descarta: ela sai na hora. Quem
  // clicou em enviar decidiu enviar; a espera e so a chance de desfazer.
  const enviarJa = useRef(aoEnviar)
  useEffect(() => {
    enviarJa.current = aoEnviar
  })
  useEffect(
    () => () => {
      const body = pendente.current
      if (body === null) return
      enviarJa.current(body).catch((falha) => toast.error(describeError(falha)))
    },
    [],
  )

  function enviar() {
    const escrito = texto.trim()
    if (escrito.length === 0 || enviando || aSair !== null) return

    if (esperaAntesDeEnviar) {
      setTexto('')
      setErro(null)
      setASair(escrito)
    } else void gravarAgora(escrito)
  }

  function desfazerEnvio() {
    if (aSair === null) return
    // O que se comecou a escrever durante a espera fica, depois do texto desfeito: o
    // campo ja estava livre, e trocar um pelo outro perdia o texto novo.
    const desfeito = aSair
    setTexto((agora) => (agora.trim().length === 0 ? desfeito : `${desfeito}\n${agora}`))
    setASair(null)
  }

  const rotuloDoBotao = destaque ? 'Escrever para quem relatou' : 'Comentar entre o time'

  return (
    <div
      ref={area}
      className={`mb-4 rounded-xl border p-3.5 ${
        destaque ? 'border-warn-border bg-warn-surface' : 'border-border bg-surface'
      }`}
    >
      <h3 className={`mb-0.5 font-medium text-detail ${destaque ? 'text-warn-fg' : 'text-fg'}`}>
        {titulo}
      </h3>
      <p
        className={`mb-3 text-caption leading-normal ${destaque ? 'text-warn-fg' : 'text-fg-muted'}`}
      >
        {explicacao}
      </p>

      {comentarios.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2.5">
          {comentarios.map((comentario) => (
            // O endereco do comentario: o aviso da mencao, no sino, rola ate aqui e o acende.
            <li
              key={comentario.PublicId}
              id={`comentario-${comentario.PublicId}`}
              tabIndex={-1}
              className="rounded-md outline-none"
            >
              <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 text-caption text-fg-muted">
                {/* **Tres casos, e nao dois.** Quem relatou e a pessoa de fora
                    respondendo; nome vazio e alguem do time cuja conta foi
                    esvaziada. Mostrar os dois igual poria palavra de um na boca
                    do outro — e aqui a diferenca decide quem responde a quem. */}
                <span className={cn('font-medium', comentario.FromReporter && 'text-fg')}>
                  {comentario.FromReporter
                    ? 'Quem relatou'
                    : comentario.AuthorName || 'Alguém do time'}
                </span>
                <time dateTime={comentario.CreatedAt} title={formatDateTime(comentario.CreatedAt)}>
                  {formatRelative(comentario.CreatedAt)}
                </time>
                {comentario.EditedAt && (
                  <span title={`Corrigido em ${formatDateTime(comentario.EditedAt)}`}>
                    · editado
                  </span>
                )}
                {comentario.IsYours &&
                  aoCorrigir &&
                  aoApagar &&
                  corrigindo !== comentario.PublicId && (
                    <span className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCorrigindo(comentario.PublicId)}
                        aria-label="Editar o seu comentário"
                        className="underline-offset-2 hover:text-fg hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setApagando(comentario)}
                        aria-label="Apagar o seu comentário"
                        className="underline-offset-2 hover:text-fg hover:underline"
                      >
                        Apagar
                      </button>
                    </span>
                  )}
              </div>
              {corrigindo === comentario.PublicId && mencoesNoProjeto && aoCorrigir ? (
                <Correcao
                  projectPublicId={mencoesNoProjeto}
                  comentario={comentario}
                  aoSalvar={(body) => aoCorrigir(comentario.PublicId, body)}
                  aoSair={() => setCorrigindo(null)}
                />
              ) : (
                <p className="whitespace-pre-wrap break-words text-detail text-fg leading-relaxed">
                  {mencoesNoProjeto ? <CommentBody body={comentario.Body} /> : comentario.Body}
                </p>
              )}
              {(anexosPorFala?.get(comentario.PublicId)?.length ?? 0) > 0 && (
                <div className="mt-2">
                  <AttachmentGallery
                    label="Imagens da resposta"
                    fileLabel="Arquivos da resposta"
                    fileNote={AVISO_DE_ARQUIVO}
                    onExpired={aoExpirar}
                    items={(anexosPorFala?.get(comentario.PublicId) ?? []).map(toPanelGalleryItem)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {aSair !== null && (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warn-border bg-surface px-2.5 py-2 text-detail text-fg"
        >
          <span>Enviando para quem relatou…</span>
          <button
            type="button"
            onClick={desfazerEnvio}
            className="font-medium underline underline-offset-2 hover:text-fg-muted"
          >
            Desfazer
          </button>
        </div>
      )}

      {podeEscrever && (
        <>
          {mencoesNoProjeto ? (
            <div className="mb-2">
              <MentionTextarea
                projectPublicId={mencoesNoProjeto}
                ariaLabel={titulo}
                value={texto}
                onChange={(valor) => {
                  setTexto(valor)
                  if (erro) setErro(null)
                }}
                onMention={(pessoa) => setMencionados((antes) => [...antes, pessoa])}
                onSubmit={enviar}
                describedBy={dica}
                maxLength={MAX_COMMENT_LENGTH}
                disabled={enviando}
                className="block w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-detail text-fg leading-relaxed"
              />
            </div>
          ) : (
            <textarea
              aria-label={titulo}
              aria-describedby={dica}
              value={texto}
              onChange={(event) => {
                setTexto(event.target.value)
                if (erro) setErro(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  enviar()
                }
              }}
              maxLength={MAX_COMMENT_LENGTH}
              disabled={enviando}
              rows={2}
              className="mb-2 block w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-detail text-fg leading-relaxed"
            />
          )}

          {erro && <p className="mb-2 text-caption text-error-fg">{erro}</p>}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              size="sm"
              disabled={texto.trim().length === 0 || enviando || aSair !== null}
              onClick={enviar}
            >
              {rotuloDoBotao}
            </Button>
            <span
              id={dica}
              className={cn('text-caption', destaque ? 'text-warn-fg' : 'text-fg-muted')}
            >
              Ctrl+Enter envia
            </span>
          </div>
        </>
      )}

      {apagando && aoApagar && (
        <ConfirmDialog
          open
          onOpenChange={(aberto) => {
            if (!aberto) setApagando(null)
          }}
          title="Apagar o comentário?"
          description="O comentário sai da conversa, e quem foi mencionado nele deixa de ver o aviso no sino."
          confirmLabel="Apagar"
          tone="warn"
          onConfirm={async () => {
            try {
              await aoApagar(apagando.PublicId)
              toast.done('Comentário apagado.')
            } catch (falha) {
              toast.error(`Não deu para apagar o comentário. ${describeError(falha)}`)
            }
          }}
        />
      )}
    </div>
  )
}

/**
 * A correcao de um comentario entre o time, no lugar dele. As mencoes voltam a ser
 * "@Nome" no campo, e quem cada uma e continua guardado: reenviado, o texto leva as
 * marcas de novo — so as que ficaram.
 */
function Correcao({
  projectPublicId,
  comentario,
  aoSalvar,
  aoSair,
}: {
  projectPublicId: string
  comentario: Comentario
  aoSalvar: (body: string) => Promise<void>
  aoSair: () => void
}) {
  const [original] = useState(() => decodeMentions(comentario.Body))
  const [texto, setTexto] = useState(original.text)
  const [mencionados, setMencionados] = useState<ChosenMention[]>(original.chosen)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const perguntar = useDiscardQuestion()

  const mudou = texto.trim() !== original.text.trim()
  const area = useRef<HTMLDivElement>(null)
  // O Esc sai da correcao; com o texto mudado, pergunta antes.
  useCardDraft({ sujo: mudou, cancelar: () => (mudou ? perguntar(aoSair) : aoSair()) }, area)

  async function salvar() {
    const escrito = texto.trim()
    if (escrito.length === 0 || salvando) return
    if (!mudou) {
      aoSair()
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await aoSalvar(encodeMentions(escrito, mencionados))
      aoSair()
    } catch (falha) {
      setErro(describeError(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div ref={area} className="flex flex-col gap-2">
      <MentionTextarea
        projectPublicId={projectPublicId}
        ariaLabel="Corrigir o comentário"
        value={texto}
        onChange={(valor) => {
          setTexto(valor)
          if (erro) setErro(null)
        }}
        onMention={(pessoa) => setMencionados((antes) => [...antes, pessoa])}
        onSubmit={() => void salvar()}
        autoFocus
        maxLength={MAX_COMMENT_LENGTH}
        disabled={salvando}
        className="block w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-detail text-fg leading-relaxed"
      />
      {erro && <p className="text-caption text-error-fg">{erro}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={texto.trim().length === 0 || salvando}
          onClick={() => void salvar()}
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button size="sm" variant="quiet" disabled={salvando} onClick={aoSair}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
