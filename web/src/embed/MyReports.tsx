import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ReporterCodeReportViewModel } from '@/contracts'
import { describeError, reportService } from '@/data/publicIndex'
import { BackButton } from '@/embed/ScreenNav'
import { STICKY_TOP_SCROLL_PADDING, StickyTop } from '@/embed/StickyTop'
import { Button } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'
import { buildIdentityLink, buildReporterCodeLink, type TrackingLink } from '@/shared/lib/tracking'

/**
 * O relato aberto, com o mesmo conteudo da pagina de acompanhamento. **Baixado so no
 * clique**: quem abre o formulario para relatar nao paga pela conversa, pela jornada e
 * pelo encerramento que talvez nunca leia.
 */
const TrackingReport = lazy(() =>
  import('@/tracking/TrackingPage').then((modulo) => ({ default: modulo.TrackingReport })),
)

/**
 * Por onde a lista é pedida: o código que a pessoa guarda, ou o crachá que o site
 * entregou. **Com o crachá não há campo nenhum**: a pessoa já entrou no site, e pedir
 * um código a quem o site conhece seria perguntar duas vezes.
 */
export type MyReportsCredential =
  | {
      tipo: 'codigo'
      /** O código guardado, ou vazio se este navegador nunca relatou aqui. */
      code: string
      onCodeChange: (code: string) => void
    }
  | {
      tipo: 'identidade'
      /** O crachá de agora. Vazio sem crachá — e aí a lista é vazia sem perguntar. */
      token: string
    }

/**
 * "Os meus relatos", dentro do próprio quadro.
 *
 * **A lista e o relato moram aqui.** Clicar num relato o abre no próprio quadro, com o
 * mesmo conteúdo da página de acompanhamento (`TrackingReport`, compacto), e a pessoa
 * lê sem sair do site. "Abrir em nova guia" leva à página de sempre, para quem quer ler
 * com espaço; ela entra pela mesma credencial da lista.
 *
 * **Lista vazia não é erro, e a tela não pode tratá-la como erro.** Código digitado
 * errado responde exatamente como código que ainda não tem relato: é o que impede
 * a rota de virar um oráculo, e a consequência é que aqui não dá para dizer "código
 * não encontrado". A frase precisa servir aos dois casos sem mentir em nenhum. O
 * crachá responde igual: o que não confere e o que nunca relatou são a mesma lista.
 */
/**
 * De quanto em quanto tempo a lista na tela se le de novo. Tres pedidos por minuto, por
 * quem esta com a lista aberta: bem abaixo do limite de quem chama sem login.
 */
export const ATUALIZAR_A_CADA_MS = 20_000

export function MyReports({
  publicKey,
  credencial,
  onBack,
}: {
  publicKey: string
  credencial: MyReportsCredential
  onBack: () => void
}) {
  const peloCracha = credencial.tipo === 'identidade'
  // Em valores soltos, e não no objeto: o quadro monta a credencial a cada desenho, e
  // os efeitos abaixo só podem acordar quando o que importa mudar.
  const code = credencial.tipo === 'codigo' ? credencial.code : ''
  const onCodeChange = credencial.tipo === 'codigo' ? credencial.onCodeChange : null
  const token = credencial.tipo === 'identidade' ? credencial.token : ''

  const [digitado, setDigitado] = useState(code)
  const [relatos, setRelatos] = useState<ReporterCodeReportViewModel[] | null>(null)
  /**
   * O código que **trouxe** esta lista, que não é o mesmo que o campo mostra.
   *
   * Quem digita outro código sem buscar deixa os dois diferentes por um instante —
   * e é o da lista que vale para montar os links, porque é dele que os relatos
   * são. Montar com o do campo faria cada "Abrir" apontar para uma credencial que
   * nunca listou aquele relato.
   */
  const [codigoDaLista, setCodigoDaLista] = useState('')
  const [temMais, setTemMais] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  /** O relato aberto aqui dentro. Nulo, a lista. */
  const [aberto, setAberto] = useState<string | null>(null)
  /**
   * Cada leitura da lista leva um numero, e so a ultima vale. A atualizacao sozinha pode
   * voltar depois de uma busca por outro codigo, e nao pode trocar a lista nova pela velha.
   */
  const leitura = useRef(0)
  /** O relato de onde a pessoa veio: ao voltar, o foco volta a ele, e nao ao topo. */
  const voltarPara = useRef<string | null>(null)
  const lista = useRef<HTMLUListElement>(null)

  const buscar = useCallback(
    async (codigo: string) => {
      const limpo = codigo.trim()
      if (limpo.length === 0) return

      setBuscando(true)
      setErro(null)
      const minha = ++leitura.current

      try {
        const resposta = await reportService.listByReporterCode({ Key: publicKey, Code: limpo })
        if (minha !== leitura.current) return
        setRelatos(resposta.Reports)
        setTemMais(resposta.HasMore)
        setCodigoDaLista(limpo)
        onCodeChange?.(limpo)
      } catch (falha) {
        setErro(describeError(falha))
      } finally {
        setBuscando(false)
      }
    },
    [publicKey, onCodeChange],
  )

  const buscarPeloCracha = useCallback(
    async (cracha: string) => {
      setBuscando(true)
      setErro(null)
      const minha = ++leitura.current

      try {
        const resposta = await reportService.listByIdentity({
          Key: publicKey,
          IdentityToken: cracha,
        })
        if (minha !== leitura.current) return
        setRelatos(resposta.Reports)
        setTemMais(resposta.HasMore)
      } catch (falha) {
        setErro(describeError(falha))
      } finally {
        setBuscando(false)
      }
    },
    [publicKey],
  )

  // Com código guardado, a lista já vem pronta: quem voltou ao site não deveria
  // ter de digitar o que o navegador dela já sabe.
  useEffect(() => {
    if (!peloCracha && code.trim().length > 0) void buscar(code)
  }, [peloCracha, code, buscar])

  // Com o crachá, sempre: não há o que digitar. Sem crachá a lista é vazia sem
  // perguntar — a API responderia o mesmo, e a viagem só atrasaria a tela.
  useEffect(() => {
    if (!peloCracha) return
    if (token.length > 0) void buscarPeloCracha(token)
    else setRelatos([])
  }, [peloCracha, token, buscarPeloCracha])

  /**
   * Le a lista de novo, **sem piscar**: nem o "Buscando", nem o erro, nem o campo mudam.
   * Falhou, fica a lista que ja estava na tela.
   */
  const atualizar = useCallback(async () => {
    const credencialDaLista = peloCracha ? token : codigoDaLista
    if (credencialDaLista.length === 0) return
    const minha = ++leitura.current
    try {
      const resposta = peloCracha
        ? await reportService.listByIdentity({ Key: publicKey, IdentityToken: token })
        : await reportService.listByReporterCode({ Key: publicKey, Code: codigoDaLista })
      if (minha !== leitura.current) return
      setRelatos(resposta.Reports)
      setTemMais(resposta.HasMore)
    } catch {
      // A lista de antes continua valendo ate a proxima volta.
    }
  }, [peloCracha, token, codigoDaLista, publicKey])

  // **A lista acompanha o time.** Antes ela era lida uma vez so: o time movia o card, o
  // relato aberto mudava ao vivo, e a lista continuava dizendo a etapa antiga. Agora ela
  // le de novo a cada `ATUALIZAR_A_CADA_MS` enquanto esta na tela, e na hora em que a
  // aba volta a ficar visivel. Aba escondida nao pede nada.
  const listaNaTela = aberto === null && relatos !== null
  useEffect(() => {
    if (!listaNaTela) return
    const visivel = () => document.visibilityState === 'visible'
    const relogio = setInterval(() => {
      if (visivel()) void atualizar()
    }, ATUALIZAR_A_CADA_MS)
    const aoVoltar = () => {
      if (visivel()) void atualizar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [listaNaTela, atualizar])

  /** O link da pagina de acompanhamento deste relato, pela credencial da lista. */
  const linkDe = (trackingCode: string) =>
    peloCracha
      ? buildIdentityLink(trackingCode, publicKey, token)
      : buildReporterCodeLink(trackingCode, publicKey, codigoDaLista)

  // Voltando da leitura, o foco cai no relato que estava aberto.
  useEffect(() => {
    if (aberto !== null || voltarPara.current === null) return
    const codigo = voltarPara.current
    voltarPara.current = null
    lista.current?.querySelector<HTMLButtonElement>(`[data-relato="${codigo}"]`)?.focus()
  }, [aberto])

  if (aberto !== null) {
    const entrada: TrackingLink = {
      code: aberto,
      token: '',
      key: publicKey,
      reporterCode: peloCracha ? '' : codigoDaLista,
      identityToken: peloCracha ? token : '',
    }

    return (
      <section
        className={cn(
          'rolagem-do-quadro flex h-full animate-fade-in flex-col gap-4 overflow-y-auto bg-surface p-5',
          STICKY_TOP_SCROLL_PADDING,
        )}
      >
        {/* O topo preso ao rolar, como no formulario: o relato aberto e longo, e o caminho
            de volta nao pode ficar la em cima. */}
        <StickyTop className="flex items-center justify-between gap-3">
          <BackButton
            autoFocus
            onClick={() => {
              voltarPara.current = aberto
              setAberto(null)
              // O relato aberto pode ter andado enquanto a pessoa lia: a lista volta em dia.
              void atualizar()
            }}
          >
            Voltar aos seus relatos
          </BackButton>
          {/* Janela nova pelo mesmo motivo do link da confirmação: a página tem espaço
              para ler. E `noreferrer` pelo `noopener` que ele implica, porque este
              quadro roda dentro do site de outra pessoa. */}
          <a
            href={linkDe(aberto)}
            target="_blank"
            rel="noreferrer"
            className="flex-none font-medium text-caption text-fg underline underline-offset-4 pointer-coarse:-my-3 pointer-coarse:py-3"
          >
            Abrir em nova guia
          </a>
        </StickyTop>

        <Suspense fallback={<p className="text-caption text-fg-muted">Abrindo o relato…</p>}>
          <TrackingReport entrada={entrada} compacto />
        </Suspense>
      </section>
    )
  }

  return (
    <section
      className={cn(
        'rolagem-do-quadro flex h-full flex-col gap-4 overflow-y-auto bg-surface p-5',
        STICKY_TOP_SCROLL_PADDING,
      )}
    >
      {/* O topo preso ao rolar: com a lista longa, o "Voltar" sumia la em cima. */}
      <StickyTop className="flex items-center">
        <BackButton onClick={onBack}>Voltar ao formulário</BackButton>
      </StickyTop>

      {/* O que esta tela e, antes de qualquer campo: quem chega aqui pela primeira vez
          entende para que ela serve sem precisar adivinhar pelo campo vazio. */}
      <div>
        <h1 className="font-semibold text-fg text-lead tracking-tight">Os seus relatos</h1>
        <p className="mt-1 text-detail text-fg-muted leading-relaxed">
          Acompanhe o andamento e as respostas do time
        </p>
      </div>

      {!peloCracha && (
        <div>
          <label htmlFor="codigo-pessoal" className="mb-1.5 block text-detail text-fg-muted">
            O seu código
          </label>
          <div className="flex gap-2">
            <input
              id="codigo-pessoal"
              value={digitado}
              onChange={(evento) => setDigitado(evento.target.value.toUpperCase())}
              placeholder="H7QK-3M2X-P9WD"
              // Maiúsculas e monoespaçado: o código é lido de um papel e conferido
              // símbolo a símbolo, e fonte proporcional faz `1` e `l` se confundirem
              // — mesmo que o alfabeto já evite os piores pares.
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 font-mono text-body text-fg uppercase pointer-coarse:h-11"
            />
            <Button
              size="sm"
              disabled={buscando || digitado.trim().length === 0}
              onClick={() => void buscar(digitado)}
            >
              {buscando ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
          {/* Enquanto nao ha relato na tela, a frase diz onde achar o codigo: sem ela, o
              campo vazio pedia uma coisa que a pessoa nem sabia que tinha. */}
          {(relatos === null || relatos.length === 0) && (
            <p className="mt-2 text-caption text-fg-muted leading-relaxed">
              Ele aparece na confirmação, logo depois que você envia um relato
            </p>
          )}
        </div>
      )}

      {peloCracha && buscando && relatos === null && (
        <p className="text-caption text-fg-muted leading-relaxed">Buscando…</p>
      )}

      {erro && <p className="text-caption text-error-fg leading-relaxed">{erro}</p>}

      {relatos !== null && relatos.length === 0 && (
        /* **Não diz "código não encontrado", e não pode dizer.** Ver o comentário
           do componente: os dois casos respondem igual de propósito. */
        <div className="rounded-lg border border-border border-dashed px-4 py-5 text-center">
          <p className="font-medium text-detail text-fg">
            {peloCracha ? 'Nenhum relato seu por aqui ainda' : 'Nenhum relato com esse código'}
          </p>
          <p className="mt-1 text-caption text-fg-muted leading-relaxed">
            {peloCracha
              ? 'Se você relatou há pouco, recarregue a página e tente de novo'
              : 'Confira se digitou certo, ou abra o relato pelo link que veio com ele'}
          </p>
        </div>
      )}

      {relatos !== null && relatos.length > 0 && (
        <ul ref={lista} className="flex flex-col gap-2.5">
          {relatos.map((relato) => (
            <li key={relato.TrackingCode}>
              {/* O cartão inteiro abre o relato aqui dentro: o alvo é o relato, e não
                  uma palavra pequena no canto dele. **O que a pessoa escreveu vem
                  primeiro**: é por ele que ela reconhece o relato, e o protocolo, que
                  ninguém decora, fica no rodapé junto da data. */}
              <button
                type="button"
                data-relato={relato.TrackingCode}
                onClick={() => setAberto(relato.TrackingCode)}
                className="group w-full rounded-lg border border-border bg-surface-raised p-3 text-left transition-colors duration-150 ease-out hover:bg-surface-sunken motion-reduce:transition-none"
              >
                <span className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    {/* O titulo que ela escreveu, quando escreveu, e nunca o do time. */}
                    <span className="line-clamp-2 block font-medium text-detail text-fg">
                      {relato.Title ?? relato.Excerpt}
                    </span>
                    {relato.Title && (
                      <span className="mt-0.5 line-clamp-2 block text-caption text-fg-muted leading-relaxed">
                        {relato.Excerpt}
                      </span>
                    )}
                  </span>
                  <SetaAbrir />
                </span>

                <span className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Andamento encerrado={relato.IsClosed} rotulo={relato.StageLabel} />
                  <time dateTime={relato.CreatedAt} className="text-caption text-fg-muted">
                    {formatRelative(relato.CreatedAt)}
                  </time>
                  <span className="ml-auto font-mono text-caption text-fg-muted">
                    {relato.TrackingCode}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {temMais && (
        /* **Diz que há mais, e não quantos.** Contar entregaria o tamanho da lista
           de outra pessoa a quem estivesse sondando — e para quem está lendo, o
           número não muda nada: o que falta se alcança pelo link de cada relato. */
        <p className="text-caption text-fg-muted leading-relaxed">
          Estes são os mais recentes, e os outros continuam abrindo pelo link que você guardou
        </p>
      )}
    </section>
  )
}

/**
 * Onde o relato esta, num selo: azul enquanto anda, cinza depois de encerrado. Sao as cores
 * que o quadro do time ja usa para "fazendo" e "por fazer", e o selo se acha de relance numa
 * lista, coisa que um texto solto no canto nao fazia.
 */
function Andamento({ encerrado, rotulo }: { encerrado: boolean; rotulo: string | null }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-caption',
        encerrado
          ? 'border-chip-gray-border bg-chip-gray-surface text-chip-gray-fg'
          : 'border-chip-blue-border bg-chip-blue-surface text-chip-blue-fg',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          encerrado ? 'bg-chip-gray-glyph' : 'bg-chip-blue-glyph',
        )}
      />
      {encerrado ? 'Encerrado' : (rotulo ?? 'Em andamento')}
    </span>
  )
}

/** A seta do cartao: ele abre o relato, e ela anda um fio quando o mouse passa. */
function SetaAbrir() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 flex-none text-fg-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  )
}
