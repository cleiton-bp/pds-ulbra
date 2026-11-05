import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ReporterCodeReportViewModel } from '@/contracts'
import { describeError, reportService } from '@/data/publicIndex'
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
  /** O relato de onde a pessoa veio: ao voltar, o foco volta a ele, e nao ao topo. */
  const voltarPara = useRef<string | null>(null)
  const lista = useRef<HTMLUListElement>(null)

  const buscar = useCallback(
    async (codigo: string) => {
      const limpo = codigo.trim()
      if (limpo.length === 0) return

      setBuscando(true)
      setErro(null)

      try {
        const resposta = await reportService.listByReporterCode({ Key: publicKey, Code: limpo })
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

      try {
        const resposta = await reportService.listByIdentity({
          Key: publicKey,
          IdentityToken: cracha,
        })
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
      <section className="flex h-full animate-fade-in flex-col gap-4 overflow-y-auto bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            autoFocus
            onClick={() => {
              voltarPara.current = aberto
              setAberto(null)
            }}
          >
            Voltar aos seus relatos
          </Button>
          {/* Janela nova pelo mesmo motivo do link da confirmação: a página tem espaço
              para ler. E `noreferrer` pelo `noopener` que ele implica, porque este
              quadro roda dentro do site de outra pessoa. */}
          <a
            href={linkDe(aberto)}
            target="_blank"
            rel="noreferrer"
            className="flex-none font-medium text-caption text-fg underline underline-offset-4"
          >
            Abrir em nova guia
          </a>
        </div>

        <Suspense fallback={<p className="text-caption text-fg-muted">Abrindo o relato…</p>}>
          <TrackingReport entrada={entrada} compacto />
        </Suspense>
      </section>
    )
  }

  return (
    <section className="flex h-full flex-col gap-4 overflow-y-auto bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-semibold text-fg text-lead tracking-tight">Os seus relatos</h1>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Voltar
        </Button>
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
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 font-mono text-body text-fg uppercase"
            />
            <Button
              size="sm"
              disabled={buscando || digitado.trim().length === 0}
              onClick={() => void buscar(digitado)}
            >
              {buscando ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
        </div>
      )}

      {peloCracha && buscando && relatos === null && (
        <p className="text-caption text-fg-muted leading-relaxed">Buscando…</p>
      )}

      {erro && <p className="text-caption text-error-fg leading-relaxed">{erro}</p>}

      {relatos !== null && relatos.length === 0 && (
        /* **Não diz "código não encontrado", e não pode dizer.** Ver o comentário
           do componente: os dois casos respondem igual de propósito. */
        <p className="text-caption text-fg-muted leading-relaxed">
          {peloCracha
            ? 'Nenhum relato seu por aqui ainda. Se você relatou há pouco e ele não aparece, recarregue a página e tente de novo, o link de cada relato continua valendo.'
            : 'Nenhum relato com esse código. Confira se digitou certo, e se você relatou de outro navegador sem guardar o código, o link de cada relato continua valendo.'}
        </p>
      )}

      {relatos !== null && relatos.length > 0 && (
        <ul ref={lista} className="flex flex-col gap-2.5">
          {relatos.map((relato) => (
            <li key={relato.TrackingCode}>
              {/* O cartão inteiro abre o relato aqui dentro: o alvo é o relato, e não
                  uma palavra pequena no canto dele. */}
              <button
                type="button"
                data-relato={relato.TrackingCode}
                onClick={() => setAberto(relato.TrackingCode)}
                className="w-full rounded-lg border border-border bg-surface-raised p-3 text-left transition-colors duration-150 hover:bg-surface-sunken"
              >
                <span className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-caption text-fg-muted">
                    {relato.TrackingCode}
                  </span>
                  <span
                    className={cn(
                      'flex-none text-caption',
                      relato.IsClosed ? 'text-fg-muted' : 'text-fg',
                    )}
                  >
                    {relato.IsClosed ? 'Encerrado' : (relato.StageLabel ?? 'Em andamento')}
                  </span>
                </span>

                {/* O titulo que ela escreveu, quando escreveu — o do time nao chega aqui. */}
                {relato.Title && (
                  <span className="mb-0.5 block font-medium text-detail text-fg">
                    {relato.Title}
                  </span>
                )}
                <span
                  className={cn(
                    'mb-2 block text-detail leading-relaxed',
                    relato.Title ? 'text-fg-muted' : 'text-fg',
                  )}
                >
                  {relato.Excerpt}
                </span>

                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-caption text-fg">Ver o relato</span>
                  <time
                    dateTime={relato.CreatedAt}
                    className="flex-none text-caption text-fg-muted"
                  >
                    {formatRelative(relato.CreatedAt)}
                  </time>
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
          Estes são os mais recentes. Há outros relatos seus, e cada um continua abrindo pelo link
          que você guardou.
        </p>
      )}
    </section>
  )
}
