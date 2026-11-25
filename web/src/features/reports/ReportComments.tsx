import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import {
  type InternalCommentsPageViewModel,
  type InternalCommentViewModel,
  MAX_COMMENT_LENGTH,
  type PanelAttachmentViewModel,
  type PublicCommentsPageViewModel,
  type PublicCommentViewModel,
  type ReportCommentsViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import {
  type AcaoDaMensagem,
  CommentThread,
  destacarMensagem,
  type MensagemDoChat,
} from '@/features/reports/CommentThread'
import { useCardDraft, useDiscardQuestion } from '@/features/reports/cardDrafts'
import { MOSTRAR_CONVERSA_DO_TIME } from '@/features/reports/conversaDoTime'
import { CommentBody, crescerComOTexto, MentionTextarea } from '@/features/reports/MentionTextarea'
import { type ChosenMention, decodeMentions, encodeMentions } from '@/features/reports/mentions'
import { AVISO_DE_ARQUIVO, toPanelGalleryItem } from '@/features/reports/ReportAttachments'
import { AttachmentGallery } from '@/shared/components/AttachmentGallery'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { type AsyncResource, useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { cn } from '@/shared/lib/cn'
import { COMMENT_SEARCH_EVENT } from '@/shared/lib/commentSearch'

/**
 * Quanto a resposta a quem relatou espera antes de sair. **E o "mandei cedo demais"**:
 * o comentario publico nao se corrige, porque sai da empresa, e os segundos de espera,
 * com "Desfazer" na tela, sao a chance de voltar atras antes de a pessoa ler. A mesma
 * ideia do atraso que o projeto ja tem para a etapa publica.
 */
const ESPERA_DA_RESPOSTA_MS = 5000

/** As duas conversas do card. */
export type QualConversa = 'Internal' | 'Public'

/** Quantas mensagens o chat traz de cada vez: as mais recentes ao abrir, e cada pedaco ao subir. */
export const COMMENTS_PAGE_SIZE = 20

/** A conversa de um relato, e as falas publicas que ela pos na tela. */
export interface ReportConversation extends AsyncResource<ReportCommentsViewModel> {
  /**
   * As falas publicas que a conversa mostra, pelo identificador. **Nula enquanto
   * carrega; vazia se falhou.** E o que os arquivos de uma resposta consultam para
   * saber se a fala deles esta na tela.
   */
  falas: ReadonlySet<string> | null
  /** Ha mensagens anteriores por trazer, em cada conversa. */
  temMais: Record<QualConversa, boolean>
  /** Uma conversa esta trazendo as anteriores. */
  carregando: Record<QualConversa, boolean>
  /** Traz o pedaco anterior de uma conversa. Nada acontece sem mais ou ja trazendo. */
  carregarAnteriores: (qual: QualConversa) => Promise<void>
  /** Traz as anteriores ate achar a mensagem. Falso se ela nao e desta conversa. */
  procurar: (qual: QualConversa, publicId: string) => Promise<boolean>
}

/** O que a pessoa ja trouxe subindo, por conversa. `temMais` nulo: vale o da leitura. */
interface Paginas {
  Internal: { itens: InternalCommentViewModel[]; temMais: boolean | null }
  Public: { itens: PublicCommentViewModel[]; temMais: boolean | null }
}

const SEM_PAGINAS: Paginas = {
  Internal: { itens: [], temMais: null },
  Public: { itens: [], temMais: null },
}

/**
 * A conversa do relato, lida uma vez para o dialogo inteiro.
 *
 * **Mora fora da caixa de comentarios, e e por causa dos arquivos.** O arquivo de uma
 * resposta vai embaixo da fala que o trouxe — e, quando ela nao esta na tela, embaixo
 * do relato, em vez de sumir: a conversa que nao carregou, a resposta que chegou
 * depois de o dialogo abrir. Para isso quem monta o dialogo precisa saber quais falas
 * a caixa mostra, e a leitura sobe para ele. Ver `useReportAttachments`.
 *
 * **Aos pedacos.** A leitura traz as mensagens mais recentes de cada conversa, e o chat
 * pede as anteriores ao subir; o que veio subindo fica guardado aqui e se junta a cada
 * releitura, ao vivo ou nao. O aviso de mencao do sino pede a mensagem dele por
 * `COMMENT_SEARCH_EVENT`, e a conversa traz as anteriores ate acha-la.
 */
export function useReportComments(
  projectPublicId: string,
  reportPublicId: string,
): ReportConversation {
  const leitura = useAsyncResource(
    useCallback(
      () =>
        projectReportService.listComments(projectPublicId, reportPublicId, {
          limit: COMMENTS_PAGE_SIZE,
        }),
      [projectPublicId, reportPublicId],
    ),
  )

  // As paginas na tela e, nos refs, a verdade para as buscas encadeadas (uma busca le o que
  // a anterior acabou de trazer, antes de o React desenhar de novo).
  const [paginas, setPaginas] = useState<Paginas>(SEM_PAGINAS)
  const paginasRef = useRef<Paginas>(SEM_PAGINAS)
  const lidaRef = useRef(leitura.data)
  lidaRef.current = leitura.data
  const [carregando, setCarregando] = useState<Record<QualConversa, boolean>>({
    Internal: false,
    Public: false,
  })
  const carregandoRef = useRef<Record<QualConversa, boolean>>({ Internal: false, Public: false })
  const procurando = useRef(false)

  // Trocou de relato: as paginas eram do outro.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o gatilho e trocar de relato.
  useEffect(() => {
    paginasRef.current = SEM_PAGINAS
    setPaginas(SEM_PAGINAS)
  }, [projectPublicId, reportPublicId])

  const lida = leitura.data
  const temMais: Record<QualConversa, boolean> = {
    Internal: paginas.Internal.temMais ?? lida?.HasOlderInternal ?? false,
    Public: paginas.Public.temMais ?? lida?.HasOlderPublic ?? false,
  }

  const data = useMemo(
    () =>
      lida
        ? {
            ...lida,
            Internal: unir(paginas.Internal.itens, lida.Internal),
            Public: unir(paginas.Public.itens, lida.Public),
          }
        : null,
    [lida, paginas],
  )

  const carregarPagina = useCallback(
    async (
      qual: QualConversa,
    ): Promise<InternalCommentsPageViewModel | PublicCommentsPageViewModel | null> => {
      const atual = lidaRef.current
      if (!atual || carregandoRef.current[qual]) return null

      const pagina = paginasRef.current[qual]
      const ha =
        pagina.temMais ??
        (qual === 'Internal' ? atual.HasOlderInternal : atual.HasOlderPublic) ??
        false
      const maisAntiga = pagina.itens[0]?.PublicId ?? atual[qual][0]?.PublicId
      if (!ha || !maisAntiga) return null

      carregandoRef.current = { ...carregandoRef.current, [qual]: true }
      setCarregando(carregandoRef.current)
      try {
        const nova =
          qual === 'Internal'
            ? await projectReportService.listOlderInternalComments(
                projectPublicId,
                reportPublicId,
                maisAntiga,
                COMMENTS_PAGE_SIZE,
              )
            : await projectReportService.listOlderPublicComments(
                projectPublicId,
                reportPublicId,
                maisAntiga,
                COMMENTS_PAGE_SIZE,
              )
        const agora = paginasRef.current
        const proxima: Paginas =
          qual === 'Internal'
            ? {
                ...agora,
                Internal: {
                  itens: [...(nova.Items as InternalCommentViewModel[]), ...agora.Internal.itens],
                  temMais: nova.HasOlder,
                },
              }
            : {
                ...agora,
                Public: {
                  itens: [...(nova.Items as PublicCommentViewModel[]), ...agora.Public.itens],
                  temMais: nova.HasOlder,
                },
              }
        paginasRef.current = proxima
        setPaginas(proxima)
        return nova
      } catch (falha) {
        toast.error(`Não deu para carregar as mensagens anteriores. ${describeError(falha)}`)
        return null
      } finally {
        carregandoRef.current = { ...carregandoRef.current, [qual]: false }
        setCarregando(carregandoRef.current)
      }
    },
    [projectPublicId, reportPublicId],
  )

  const carregarAnteriores = useCallback(
    async (qual: QualConversa) => {
      await carregarPagina(qual)
    },
    [carregarPagina],
  )

  const procurar = useCallback(
    async (qual: QualConversa, publicId: string) => {
      const naTela = () =>
        (lidaRef.current?.[qual] ?? []).some((fala) => fala.PublicId === publicId) ||
        paginasRef.current[qual].itens.some((fala) => fala.PublicId === publicId)
      if (naTela()) return true
      // Uma busca de cada vez: o sino pede de novo enquanto espera, e o pedido repetido nao
      // pode abrir outra.
      if (procurando.current) return false

      procurando.current = true
      try {
        // Com um teto: uma mensagem que nao e desta conversa nao traz a conversa inteira.
        for (let pedaco = 0; pedaco < 25; pedaco++) {
          const nova = await carregarPagina(qual)
          if (!nova) return naTela()
          if (nova.Items.some((fala) => fala.PublicId === publicId)) return true
          if (!nova.HasOlder) return false
        }
        return false
      } finally {
        procurando.current = false
      }
    },
    [carregarPagina],
  )

  // O aviso de mencao do sino pede a mensagem dele: as mencoes sao sempre entre o time.
  useEffect(() => {
    const ouvir = (evento: Event) => {
      const id = (evento as CustomEvent<unknown>).detail
      if (typeof id === 'string') void procurar('Internal', id)
    }
    document.addEventListener(COMMENT_SEARCH_EVENT, ouvir)
    return () => document.removeEventListener(COMMENT_SEARCH_EVENT, ouvir)
  }, [procurar])

  const falas = data
    ? new Set(data.Public.map((fala) => fala.PublicId))
    : leitura.failed
      ? new Set<string>()
      : null

  return { ...leitura, data, falas, temMais, carregando, carregarAnteriores, procurar }
}

/**
 * O que veio subindo e a leitura de agora, sem repetir: a releitura traz a versao nova de
 * uma mensagem (a corrigida), que vale no lugar dela.
 */
function unir<T extends { PublicId: string }>(antigas: T[], recentes: T[]): T[] {
  const porId = new Map<string, T>()
  for (const fala of antigas) porId.set(fala.PublicId, fala)
  for (const fala of recentes) porId.set(fala.PublicId, fala)
  return [...porId.values()]
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

  // **Uma conversa de cada vez**, em abas: empilhadas, as duas viravam uma coisa so. O
  // card do time nao tem ninguem do lado de fora, e ali nao ha abas.
  const temFora = paraQuemRelatou !== 'nenhum'
  const [aba, setAba] = useState<QualConversa>('Internal')
  const abaAberta: QualConversa = temFora ? aba : 'Internal'
  const ids = useId()
  const idDaAba = (qual: QualConversa) => `${ids}-aba-${qual}`
  const idDoPainel = (qual: QualConversa) => `${ids}-painel-${qual}`

  // O "Comentar" do card (no alto e no pe) e o aviso de mencao, no sino, levam a conversa
  // do time: ela vem para a frente antes do foco ir para ela. Na hora (`flushSync`), para
  // o campo ja estar a vista quando o foco chega, e o teclado do celular abrir.
  useEffect(() => {
    const mostrar = () => flushSync(() => setAba('Internal'))
    document.addEventListener(MOSTRAR_CONVERSA_DO_TIME, mostrar)
    document.addEventListener(COMMENT_SEARCH_EVENT, mostrar)
    return () => {
      document.removeEventListener(MOSTRAR_CONVERSA_DO_TIME, mostrar)
      document.removeEventListener(COMMENT_SEARCH_EVENT, mostrar)
    }
  }, [])

  // Mensagem que chega na aba de tras acende um ponto nela. A referencia e a mais nova que
  // a pessoa ja tinha diante dos olhos; a apagada nao conta como nova.
  const maisNova = (falas: Array<{ CreatedAt: string }> | undefined) =>
    falas?.reduce<string | null>(
      (antes, fala) => (antes === null || fala.CreatedAt > antes ? fala.CreatedAt : antes),
      null,
    ) ?? null
  const novaDoTime = maisNova(atual?.Internal)
  const novaDeFora = maisNova(atual?.Public)
  // Ao abrir o card, a resposta de quem relatou que o time ainda nao respondeu tambem
  // acende a aba: a conversa do time abre na frente, e a resposta nao fica escondida atras.
  const ultimaDeFora = atual?.Public.reduce<PublicCommentViewModel | null>(
    (antes, fala) => (antes === null || fala.CreatedAt > antes.CreatedAt ? fala : antes),
    null,
  )
  const vistaAoAbrirDeFora = ultimaDeFora?.FromReporter
    ? (maisNova(atual?.Public.filter((fala) => !fala.FromReporter)) ?? '')
    : novaDeFora
  const [vistas, setVistas] = useState<Partial<Record<QualConversa, string | null>>>({})
  useEffect(() => {
    if (!atual) return
    setVistas((antes) => {
      const depois = { ...antes }
      if (!('Internal' in antes) || abaAberta === 'Internal') depois.Internal = novaDoTime
      if (abaAberta === 'Public') depois.Public = novaDeFora
      else if (!('Public' in antes)) depois.Public = vistaAoAbrirDeFora
      return depois.Internal === antes.Internal && depois.Public === antes.Public ? antes : depois
    })
  }, [atual, abaAberta, novaDoTime, novaDeFora, vistaAoAbrirDeFora])
  const temNovidade = (qual: QualConversa) => {
    const nova = qual === 'Internal' ? novaDoTime : novaDeFora
    const vista = vistas[qual]
    return (
      qual !== abaAberta && vista !== undefined && nova !== null && (vista === null || nova > vista)
    )
  }

  // **Expandida, a conversa cobre o corpo do card inteiro**, com as abas. O lugar dela no
  // card guarda a altura enquanto isso, para a coluna nao encolher por baixo e nada pular
  // na volta.
  const [expandido, setExpandido] = useState(false)
  const [altura, setAltura] = useState<number | null>(null)
  const lugar = useRef<HTMLDivElement>(null)
  const botaoExpandir = useRef<HTMLButtonElement>(null)
  const recolher = useCallback(() => {
    setExpandido(false)
    setAltura(null)
  }, [])
  function alternarExpandido() {
    if (expandido) {
      recolher()
      return
    }
    setAltura(lugar.current?.offsetHeight ?? null)
    setExpandido(true)
  }

  // A fala que chega ao vivo entra acima do campo, e o empurra para baixo: quem esta
  // escrevendo — no celular, com o teclado aberto — perdia o campo de vista. Ele volta
  // para a tela, e o rascunho e o foco ficam onde estavam.
  const secao = useRef<HTMLElement>(null)

  // Expandida, o Esc recolhe antes de fechar o card. A correcao de um comentario, la
  // dentro, sai primeiro: o Esc do card escolhe a edicao mais de dentro.
  useCardDraft({ sujo: false, cancelar: expandido ? recolher : undefined }, secao)

  // O foco que vai para outra parte do card (o Tab que sai, o Comentar do topo, um clique
  // fora) recolhe: a conversa expandida nao fica cobrindo onde a pessoa foi.
  useEffect(() => {
    const el = secao.current
    const dialogo = el?.closest('[role="dialog"]')
    if (!expandido || !el || !dialogo) return
    const aoFocar = (evento: FocusEvent) => {
      const alvo = evento.target
      // O proprio card recebe o foco quando o elemento focado some (a correcao que fecha,
      // a mensagem apagada): isso nao e a pessoa indo para outro lugar.
      if (alvo === dialogo) return
      if (alvo instanceof Node && dialogo.contains(alvo) && !el.contains(alvo)) recolher()
    }
    document.addEventListener('focusin', aoFocar)
    return () => document.removeEventListener('focusin', aoFocar)
  }, [expandido, recolher])

  // Expandida, o foco mora nela: o Safari nao foca o botao no clique, e sem isso o Esc
  // seguinte fecharia o card em vez de recolher a conversa.
  useLayoutEffect(() => {
    const el = secao.current
    if (expandido && el && !el.contains(document.activeElement))
      botaoExpandir.current?.focus({ preventScroll: true })
  }, [expandido])

  // Abrir e recolher com transicao, e nao num estalo: cresce de leve ao expandir.
  const jaMontou = useRef(false)
  useLayoutEffect(() => {
    if (!jaMontou.current) {
      jaMontou.current = true
      return
    }
    const el = secao.current
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    el.animate?.(
      expandido
        ? [
            { opacity: 0, transform: 'scale(0.985)' },
            { opacity: 1, transform: 'scale(1)' },
          ]
        : [{ opacity: 0.4 }, { opacity: 1 }],
      { duration: expandido ? 220 : 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    )
  }, [expandido])

  /** As setas trocam de aba, como em toda lista de abas. */
  function teclarNasAbas(evento: KeyboardEvent<HTMLDivElement>) {
    const ordem: QualConversa[] = ['Internal', 'Public']
    const atualIndice = ordem.indexOf(abaAberta)
    const proxima =
      evento.key === 'ArrowRight' || evento.key === 'ArrowLeft'
        ? ordem[(atualIndice + 1) % ordem.length]
        : evento.key === 'Home'
          ? ordem[0]
          : evento.key === 'End'
            ? ordem[ordem.length - 1]
            : undefined
    if (!proxima) return
    evento.preventDefault()
    setAba(proxima)
    document.getElementById(idDaAba(proxima))?.focus()
  }
  useLayoutEffect(() => {
    if (!atual) return
    const ativo = document.activeElement
    if (
      ativo instanceof HTMLTextAreaElement &&
      secao.current?.contains(ativo) &&
      !ativo.closest('[data-chat-expandido]')
    )
      ativo.scrollIntoView?.({ block: 'nearest' })
  }, [atual])

  return (
    // O lugar das conversas no card. Expandidas, elas saem dele e cobrem o corpo do card,
    // e o lugar fica com a altura delas.
    <div
      ref={lugar}
      style={expandido && altura !== null ? { height: altura } : undefined}
      className="border-border border-t pt-4"
    >
      <section
        ref={secao}
        data-chat-expandido={expandido || undefined}
        tabIndex={expandido ? -1 : undefined}
        className={cn(
          'flex flex-col outline-none',
          expandido &&
            'absolute inset-0 z-cover bg-surface-raised px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6',
        )}
      >
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

        {/* A linha de cima: qual conversa (as abas) e o botao de expandir. */}
        <div className="mb-2 flex items-center gap-2">
          {temFora ? (
            <div
              role="tablist"
              aria-label="Conversas do card"
              onKeyDown={teclarNasAbas}
              className="flex min-w-0 items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5"
            >
              {(['Internal', 'Public'] as const).map((qual) => {
                const escolhida = abaAberta === qual
                const nova = temNovidade(qual)
                return (
                  <button
                    key={qual}
                    id={idDaAba(qual)}
                    type="button"
                    role="tab"
                    aria-selected={escolhida}
                    aria-controls={idDoPainel(qual)}
                    tabIndex={escolhida ? 0 : -1}
                    onClick={() => setAba(qual)}
                    className={cn(
                      'flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-detail transition-[background-color,color,box-shadow] duration-150 ease-out',
                      escolhida
                        ? 'bg-surface-raised font-medium text-fg shadow-sm dark:bg-surface-strong'
                        : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn('flex flex-none', qual === 'Public' && 'text-warn-fg')}
                    >
                      <IconeDaConversa paraFora={qual === 'Public'} />
                    </span>
                    <span className="truncate">
                      {qual === 'Internal' ? 'Entre o time' : 'Para quem relatou'}
                    </span>
                    {nova && (
                      <>
                        <span
                          aria-hidden="true"
                          className="size-1.5 flex-none rounded-full bg-accent"
                        />
                        <span className="sr-only">, mensagem nova</span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <h3 className="flex items-center gap-1.5 font-medium text-detail text-fg">
              <span aria-hidden="true" className="flex text-fg-muted">
                <IconeDaConversa paraFora={false} />
              </span>
              Entre o time
            </h3>
          )}

          {/* Com borda e com o nome escrito: so o desenho nao dizia que muda o tamanho. */}
          <button
            ref={botaoExpandir}
            type="button"
            onClick={alternarExpandido}
            aria-label={expandido ? 'Recolher a conversa' : 'Expandir a conversa'}
            title={expandido ? 'Recolher a conversa (Esc)' : 'Expandir a conversa'}
            className="ml-auto flex h-7 flex-none cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-caption text-fg-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-sunken hover:text-fg active:scale-[0.97] max-sm:w-7 max-sm:justify-center max-sm:px-0"
          >
            <IconeExpandir recolher={expandido} />
            <span className="max-sm:hidden">{expandido ? 'Recolher' : 'Expandir'}</span>
          </button>
        </div>

        {loading && <Skeleton className="mb-3 h-3 w-2/3" />}

        <Caixa
          titulo="Entre o time"
          explicacao="Só o time lê, e com @ você avisa alguém no sino"
          convite="Escreva para o time"
          destaque={false}
          qual="Internal"
          conversa={conversa}
          painel={temFora ? { id: idDoPainel('Internal'), aba: idDaAba('Internal') } : undefined}
          oculta={abaAberta !== 'Internal'}
          cheia={expandido}
          mencoesNoProjeto={projectPublicId}
          comentarios={atual?.Internal ?? []}
          aoEnviar={async (body, respondeA) => {
            const salvo = await projectReportService.addInternalComment(
              projectPublicId,
              reportPublicId,
              { Body: body, ReplyToPublicId: respondeA },
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

        {temFora && (
          <Caixa
            titulo="Para quem relatou"
            explicacao={
              paraQuemRelatou === 'ler'
                ? 'Para escrever a quem relatou, desarquive o relato'
                : 'Quem relatou lê na página de acompanhamento'
            }
            convite="Escreva para quem relatou"
            destaque
            qual="Public"
            conversa={conversa}
            painel={{ id: idDoPainel('Public'), aba: idDaAba('Public') }}
            oculta={abaAberta !== 'Public'}
            cheia={expandido}
            podeEscrever={paraQuemRelatou === 'escrever'}
            esperaAntesDeEnviar
            comentarios={atual?.Public ?? []}
            // **So a caixa publica recebe arquivo.** A interna nem tem por onde: arquivo
            // so vem numa resposta de quem relatou, e quem relatou nao escreve no
            // interno. E a estrutura que garante, e nao um filtro que alguem esqueca.
            anexosPorFala={anexosPorFala}
            aoExpirar={aoExpirar}
            aoEnviar={async (body, respondeA) => {
              const salvo = await projectReportService.addPublicComment(
                projectPublicId,
                reportPublicId,
                { Body: body, ReplyToPublicId: respondeA },
              )
              setProprios((antes) => ({ ...antes, Public: [...antes.Public, salvo] }))
              aoComentar()
            }}
          />
        )}
      </section>
    </div>
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
  /** So o interno: quando foi corrigido. */
  EditedAt?: string | null
  /** De quem le: no interno, so ela corrige e apaga; nos dois, fica do lado direito. */
  IsYours?: boolean
  AuthorAvatarUrl?: string | null
  ReplyTo?: {
    PublicId: string | null
    AuthorName: string | null
    FromReporter: boolean
    Body: string | null
    IsYours?: boolean
  } | null
}

/** A resposta a quem relatou esperando para sair: o texto e a mensagem que ela responde. */
interface Saindo {
  texto: string
  resposta: Comentario | null
}

/** O texto sem as marcas de mencao: "@Nome", como a pessoa le. */
function textoSimples(body: string): string {
  return decodeMentions(body).text
}

/**
 * Uma das duas caixas. Recebe a lista e o que fazer ao enviar — e **nao** recebe
 * um tipo: quem decide qual e qual e quem a monta, uma vez, no arquivo acima.
 */
function Caixa({
  titulo,
  explicacao,
  convite,
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
  qual,
  conversa,
  painel,
  oculta = false,
  cheia = false,
}: {
  titulo: string
  /** Uma frase curta ao lado do titulo: quem le esta conversa. */
  explicacao: string
  /** O texto de exemplo do campo vazio: para quem se escreve, e o que da para fazer. */
  convite: string
  destaque: boolean
  /** Qual das duas conversas, para trazer as anteriores e procurar a citada. */
  qual: QualConversa
  conversa: ReportConversation
  /** Com as duas conversas em abas: o painel desta e a aba que o nomeia. */
  painel?: { id: string; aba: string }
  /** A outra aba esta escolhida: a caixa fica montada, com o rascunho, e escondida. */
  oculta?: boolean
  /** A conversa expandida: a caixa ocupa a altura toda, e o chat o que sobra dela. */
  cheia?: boolean
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
  /** Envia o texto, respondendo a mensagem dada quando houver. */
  aoEnviar: (body: string, respondeA?: string) => Promise<void>
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
  // A mensagem que esta sendo respondida: aparece em cima do campo, e vai junto no envio.
  const [respondendo, setRespondendo] = useState<Comentario | null>(null)
  const dica = useId()

  const campo = useRef<HTMLTextAreaElement>(null)

  // O que esta escrito e nao foi enviado: fechar o card pergunta antes de descartar.
  // Na aba escondida tambem: o rascunho fica, e fechar o card pergunta do mesmo jeito.
  const area = useRef<HTMLDivElement>(null)
  useCardDraft({ sujo: podeEscrever && texto.trim().length > 0 }, area)

  // O campo sem a mencao cresce com o texto, como o da mencao.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o texto muda a altura, e e ele que dispara a medida.
  useLayoutEffect(() => {
    crescerComOTexto(campo.current)
  }, [texto])

  /** O comentario entre o time: sai na hora, e o campo so se limpa depois de gravado. */
  async function gravarAgora(escrito: string) {
    const body = mencoesNoProjeto ? encodeMentions(escrito, mencionados) : escrito

    setEnviando(true)
    setErro(null)

    try {
      await aoEnviar(body, respondendo?.PublicId)
      setTexto('')
      setMencionados([])
      setRespondendo(null)
    } catch (failure) {
      setErro(describeError(failure))
    } finally {
      setEnviando(false)
    }
  }

  /** A resposta a quem relatou, depois da espera. A falha devolve o texto (e a citacao) ao campo. */
  async function gravarResposta(saindo: Saindo) {
    setEnviando(true)
    setErro(null)

    try {
      await aoEnviar(saindo.texto, saindo.resposta?.PublicId)
    } catch (failure) {
      // O texto volta ao campo: quem escreveu tenta de novo sem reescrever.
      setTexto((agora) => (agora.trim().length === 0 ? saindo.texto : agora))
      setRespondendo((agora) => agora ?? saindo.resposta)
      setErro(describeError(failure))
    } finally {
      setEnviando(false)
    }
  }

  // A resposta a quem relatou que esta esperando para sair. O texto ja saiu do campo,
  // e volta para ele no "Desfazer", com a citacao.
  const [aSair, setASair] = useState<Saindo | null>(null)
  const pendente = useRef<Saindo | null>(null)
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
      const saindo = pendente.current
      if (saindo === null) return
      enviarJa
        .current(saindo.texto, saindo.resposta?.PublicId)
        .catch((falha) => toast.error(describeError(falha)))
    },
    [],
  )

  function enviar() {
    const escrito = texto.trim()
    if (escrito.length === 0 || enviando || aSair !== null) return

    if (esperaAntesDeEnviar) {
      setTexto('')
      setErro(null)
      setASair({ texto: escrito, resposta: respondendo })
      setRespondendo(null)
    } else void gravarAgora(escrito)
  }

  function desfazerEnvio() {
    if (aSair === null) return
    // O que se comecou a escrever durante a espera fica, depois do texto desfeito: o
    // campo ja estava livre, e trocar um pelo outro perdia o texto novo.
    const desfeito = aSair
    setTexto((agora) =>
      agora.trim().length === 0 ? desfeito.texto : `${desfeito.texto}\n${agora}`,
    )
    setRespondendo((agora) => agora ?? desfeito.resposta)
    setASair(null)
  }

  /** Responder: a citacao vai para cima do campo, e o foco para ele. */
  function responder(comentario: Comentario) {
    setRespondendo(comentario)
    requestAnimationFrame(() =>
      area.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(),
    )
  }

  /** Leva ate a mensagem citada; se ela ainda nao esta na tela, traz as anteriores ate ela. */
  function irPara(id: string) {
    if (document.getElementById(`comentario-${id}`)) {
      destacarMensagem(id)
      return
    }
    void conversa.procurar(qual, id).then((achou) => {
      if (achou) destacarMensagem(id)
      else toast.error('Essa mensagem não está mais na conversa.')
    })
  }

  async function copiar(comentario: Comentario) {
    try {
      await navigator.clipboard.writeText(textoSimples(comentario.Body))
      toast.done('Mensagem copiada.')
    } catch {
      toast.error('Não deu para copiar a mensagem.')
    }
  }

  const mensagens: MensagemDoChat[] = comentarios.map((comentario) => {
    // **Tres casos, e nao dois.** Quem relatou e a pessoa de fora respondendo; nome vazio e
    // alguem do time cuja conta foi esvaziada. Mostrar os dois igual poria palavra de um na
    // boca do outro, e aqui a diferenca decide quem responde a quem.
    const deFora = comentario.FromReporter === true
    const minha = comentario.IsYours === true
    // Do lado de quem escreve: entre o time, as suas; com quem relatou, o time inteiro, que
    // e quem fala de dentro.
    const direita = qual === 'Internal' ? minha : !deFora
    const nome = deFora
      ? 'Quem relatou'
      : minha
        ? 'Você'
        : comentario.AuthorName || 'Alguém do time'
    const editando = corrigindo === comentario.PublicId && mencoesNoProjeto && aoCorrigir

    const acoes: AcaoDaMensagem[] = []
    if (!editando) {
      if (podeEscrever) acoes.push({ rotulo: 'Responder', aoEscolher: () => responder(comentario) })
      acoes.push({ rotulo: 'Copiar texto', aoEscolher: () => void copiar(comentario) })
      if (minha && aoCorrigir && aoApagar) {
        acoes.push({ rotulo: 'Editar', aoEscolher: () => setCorrigindo(comentario.PublicId) })
        acoes.push({ rotulo: 'Apagar', aoEscolher: () => setApagando(comentario) })
      }
    }

    const anexos = anexosPorFala?.get(comentario.PublicId) ?? []
    const citada = comentario.ReplyTo

    return {
      id: comentario.PublicId,
      autor: deFora ? 'fora' : minha ? 'eu' : `time:${comentario.AuthorName ?? ''}`,
      nome,
      foto: comentario.AuthorAvatarUrl ?? null,
      deFora,
      direita,
      // O nome e a foto so onde ajudam: nas suas mensagens, voce sabe quem escreveu.
      mostrarNome: !minha,
      criadaEm: comentario.CreatedAt,
      editadaEm: comentario.EditedAt,
      citacao: citada
        ? {
            id: citada.PublicId,
            nome: citada.FromReporter
              ? 'Quem relatou'
              : citada.IsYours
                ? 'Você'
                : citada.AuthorName || 'Alguém do time',
            texto: citada.Body === null ? null : textoSimples(citada.Body),
          }
        : null,
      corpo: editando ? (
        <div className="w-[min(22rem,70vw)] max-w-full">
          <Correcao
            projectPublicId={mencoesNoProjeto}
            comentario={comentario}
            aoSalvar={(body) => aoCorrigir(comentario.PublicId, body)}
            aoSair={() => {
              setCorrigindo(null)
              // O foco volta para a mensagem: o campo da correcao sumiu com ele.
              requestAnimationFrame(() =>
                document
                  .getElementById(`comentario-${comentario.PublicId}`)
                  ?.focus({ preventScroll: true }),
              )
            }}
          />
        </div>
      ) : mencoesNoProjeto ? (
        <CommentBody body={comentario.Body} />
      ) : (
        comentario.Body
      ),
      extra:
        anexos.length > 0 ? (
          <div className="mt-2">
            <AttachmentGallery
              label="Imagens da resposta"
              fileLabel="Arquivos da resposta"
              fileNote={AVISO_DE_ARQUIVO}
              onExpired={aoExpirar}
              items={anexos.map(toPanelGalleryItem)}
            />
          </div>
        ) : undefined,
      acoes,
    }
  })

  const rotuloDoBotao = destaque ? 'Escrever para quem relatou' : 'Comentar entre o time'
  const classeDoCampo = cn(
    'block max-h-40 min-h-9 w-full resize-none rounded-2xl border bg-surface-raised px-3 py-[7px] text-detail text-fg leading-normal placeholder:text-fg-placeholder',
    destaque ? 'border-warn-border' : 'border-border',
  )

  return (
    <div
      ref={area}
      {...(painel ? { id: painel.id, role: 'tabpanel', 'aria-labelledby': painel.aba } : {})}
      hidden={oculta}
      className={cn('flex flex-col', cheia && 'min-h-0 flex-1')}
    >
      {/* Quem le esta conversa, numa frase. */}
      <p className="mb-1 text-caption text-fg-muted leading-snug">{explicacao}</p>

      <CommentThread
        rotulo={titulo}
        mensagens={mensagens}
        temMais={conversa.temMais[qual]}
        carregando={conversa.carregando[qual]}
        aoPedirAnteriores={() => void conversa.carregarAnteriores(qual)}
        aoIrPara={irPara}
        paraFora={destaque}
        cheia={cheia}
        visivel={!oculta}
        vazio={
          qual === 'Internal'
            ? 'Nenhuma mensagem entre o time ainda'
            : 'Nenhuma mensagem com quem relatou ainda'
        }
      />

      {aSair !== null && (
        <div
          role="status"
          className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-warn-surface px-2.5 py-1.5 text-detail text-fg"
        >
          <span>Enviando para quem relatou…</span>
          <button
            type="button"
            onClick={desfazerEnvio}
            className="cursor-pointer font-medium underline underline-offset-2 hover:text-fg-muted pointer-coarse:-my-3 pointer-coarse:py-3"
          >
            Desfazer
          </button>
        </div>
      )}

      {podeEscrever && (
        <div className="mt-1.5">
          {respondendo && (
            <div className="mb-1.5 flex animate-fade-in items-start gap-2 rounded-lg bg-surface-sunken px-2.5 py-1.5">
              <div className="min-w-0 flex-1 border-chip-blue-glyph border-l-2 pl-2">
                <p className="font-medium text-caption text-fg">
                  Respondendo a{' '}
                  {respondendo.FromReporter
                    ? 'quem relatou'
                    : respondendo.IsYours
                      ? 'você'
                      : respondendo.AuthorName || 'alguém do time'}
                </p>
                <p className="line-clamp-1 text-caption text-fg-muted">
                  {textoSimples(respondendo.Body)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cancelar a resposta"
                onClick={() => setRespondendo(null)}
                className="flex size-6 flex-none cursor-pointer items-center justify-center rounded-full text-fg-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-strong hover:text-fg active:scale-90"
              >
                <svg
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          )}
          {/* O campo e o enviar numa linha, como num chat: o campo cresce com o texto. */}
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              {mencoesNoProjeto ? (
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
                  placeholder={convite}
                  rows={1}
                  autoGrow
                  listAbove
                  className={classeDoCampo}
                />
              ) : (
                <textarea
                  ref={campo}
                  aria-label={titulo}
                  aria-describedby={dica}
                  placeholder={convite}
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
                  rows={1}
                  className={classeDoCampo}
                />
              )}
            </div>
            <button
              type="button"
              onClick={enviar}
              disabled={texto.trim().length === 0 || enviando || aSair !== null}
              aria-label={rotuloDoBotao}
              title={`${rotuloDoBotao} (Ctrl+Enter)`}
              className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full bg-accent text-accent-fg transition-[background-color,color,transform] duration-150 ease-out enabled:hover:bg-accent-hover enabled:active:scale-[0.94] disabled:cursor-default disabled:bg-surface-sunken disabled:text-fg-muted"
            >
              <IconeEnviar />
            </button>
          </div>
          {/* O atalho e dito a quem usa leitor de tela junto do campo; na tela ele mora
                  na dica do botao de enviar. */}
          <span id={dica} className="sr-only">
            Ctrl+Enter envia
          </span>
          {erro && <p className="mt-1.5 text-caption text-error-fg">{erro}</p>}
        </div>
      )}

      {apagando && aoApagar && (
        <ConfirmDialog
          open
          onOpenChange={(aberto) => {
            if (!aberto) setApagando(null)
          }}
          title="Apagar o comentário?"
          description="Quem foi mencionado nele deixa de ver o aviso no sino."
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

/** O cadeado da conversa do time; a pessoa da conversa com quem relatou. */
function IconeDaConversa({ paraFora }: { paraFora: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paraFora ? (
        <>
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M3 13.5a5 5 0 0 1 10 0" />
        </>
      ) : (
        <>
          <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </>
      )}
    </svg>
  )
}

/** As setas para fora (expandir) e para dentro (recolher). */
function IconeExpandir({ recolher }: { recolher: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {recolher ? (
        <path d="M9.5 2.5V6.5H13.5M9.5 6.5L14 2M6.5 13.5V9.5H2.5M6.5 9.5L2 14" />
      ) : (
        <path d="M10 2.5H13.5V6M13.5 2.5L9 7M6 13.5H2.5V10M2.5 13.5L7 9" />
      )}
    </svg>
  )
}

/** O aviaozinho de enviar. */
function IconeEnviar() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2L7.2 8.8M14 2L9.6 14L7.2 8.8L2 6.4L14 2Z" />
    </svg>
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
