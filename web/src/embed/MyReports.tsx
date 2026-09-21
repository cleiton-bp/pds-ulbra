import { useCallback, useEffect, useState } from 'react'
import type { ReporterCodeReportViewModel } from '@/contracts'
import { describeError, reportService } from '@/data/publicIndex'
import { Button } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'
import { buildReporterCodeLink } from '@/shared/lib/tracking'

/**
 * "Os meus relatos", dentro do próprio quadro.
 *
 * **A lista mora aqui, e o relato mora numa janela nova.** São 360 por 520 pixels:
 * dá para reconhecer qual relato é qual, e não dá para ler um inteiro. O botão
 * leva para a página de acompanhamento, que é a mesma de sempre — só entra por
 * outra credencial.
 *
 * **Lista vazia não é erro, e a tela não pode tratá-la como erro.** Código digitado
 * errado responde exatamente como código que ainda não tem relato: é o que impede
 * a rota de virar um oráculo, e a consequência é que aqui não dá para dizer "código
 * não encontrado". A frase precisa servir aos dois casos sem mentir em nenhum.
 */
export function MyReports({
  publicKey,
  code,
  onCodeChange,
  onBack,
}: {
  publicKey: string
  /** O código guardado, ou vazio se este navegador nunca relatou aqui. */
  code: string
  onCodeChange: (code: string) => void
  onBack: () => void
}) {
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
        onCodeChange(limpo)
      } catch (falha) {
        setErro(describeError(falha))
      } finally {
        setBuscando(false)
      }
    },
    [publicKey, onCodeChange],
  )

  // Com código guardado, a lista já vem pronta: quem voltou ao site não deveria
  // ter de digitar o que o navegador dela já sabe.
  useEffect(() => {
    if (code.trim().length > 0) void buscar(code)
  }, [code, buscar])

  return (
    <section className="flex h-full flex-col gap-4 overflow-y-auto bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-semibold text-fg text-lead tracking-tight">Os seus relatos</h1>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Voltar
        </Button>
      </div>

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

      {erro && <p className="text-caption text-error-fg leading-relaxed">{erro}</p>}

      {relatos !== null && relatos.length === 0 && (
        /* **Não diz "código não encontrado", e não pode dizer.** Ver o comentário
           do componente: os dois casos respondem igual de propósito. */
        <p className="text-caption text-fg-muted leading-relaxed">
          Nenhum relato com esse código. Confira se digitou certo — e se você relatou de outro
          navegador sem guardar o código, o link de cada relato continua valendo.
        </p>
      )}

      {relatos !== null && relatos.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {relatos.map((relato) => (
            <li
              key={relato.TrackingCode}
              className="rounded-lg border border-border bg-surface-raised p-3"
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="font-mono text-caption text-fg-muted">{relato.TrackingCode}</span>
                <span
                  className={cn(
                    'flex-none text-caption',
                    relato.IsClosed ? 'text-fg-muted' : 'text-fg',
                  )}
                >
                  {relato.IsClosed ? 'Encerrado' : (relato.StageLabel ?? 'Em andamento')}
                </span>
              </div>

              <p className="mb-2 text-detail text-fg leading-relaxed">{relato.Excerpt}</p>

              <div className="flex items-baseline justify-between gap-2">
                {/* Janela nova pelo mesmo motivo do link da confirmação: aqui dentro
                    não se lê um relato. E `noreferrer` pelo `noopener` que ele
                    implica — este quadro roda dentro do site de outra pessoa. */}
                <a
                  href={buildReporterCodeLink(relato.TrackingCode, publicKey, codigoDaLista)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-caption text-fg underline underline-offset-4"
                >
                  Abrir
                </a>
                <time dateTime={relato.CreatedAt} className="flex-none text-caption text-fg-muted">
                  {formatRelative(relato.CreatedAt)}
                </time>
              </div>
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
