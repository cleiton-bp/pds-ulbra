import { useCallback, useEffect, useId, useState } from 'react'
import type { ReportLimitsViewModel, ReportLimitValues } from '@/contracts'
import { describeError, projectReportLimitsService } from '@/data'
import { Button } from '@/shared/components/Button'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { LeaveGuard } from '@/shared/components/LeaveGuard'
import { describeChanges } from '@/shared/components/MoreOptions'
import { NumberField } from '@/shared/components/NumberField'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/** Cada limite, na ordem da tela: da camada mais estreita para a mais larga. */
const CAMPOS: {
  chave: keyof ReportLimitValues
  rotulo: string
  unidade: string
  explicacao: string
  minimo: number
}[] = [
  {
    chave: 'PerReporter',
    rotulo: 'Por pessoa',
    unidade: 'a cada 10 min',
    explicacao:
      'A pessoa é o código pessoal, quando o projeto usa esse modo; senão, a conexão (IP) de onde ela manda.',
    minimo: 1,
  },
  {
    chave: 'PerIpPerHour',
    rotulo: 'Por conexão (IP)',
    unidade: 'por hora',
    explicacao:
      'Cabe um escritório inteiro atrás de um roteador só. O IP serve só para contar, na memória: não é guardado.',
    minimo: 1,
  },
  {
    chave: 'PerOriginPerHour',
    rotulo: 'Por domínio',
    unidade: 'por hora',
    explicacao:
      'O domínio que a página informa — por isso existem também os limites por IP e por projeto.',
    minimo: 1,
  },
  {
    chave: 'PerProjectPerHour',
    rotulo: 'Do projeto inteiro',
    unidade: 'por hora',
    explicacao: 'Somando todos os domínios e todas as pessoas.',
    minimo: 1,
  },
  {
    chave: 'PerProjectPerDay',
    rotulo: 'Do projeto inteiro',
    unidade: 'por dia',
    explicacao: 'Nas últimas 24 horas. Não pode ser menor que o limite por hora.',
    minimo: 1,
  },
  {
    chave: 'MinIntervalSeconds',
    rotulo: 'Intervalo mínimo',
    unidade: 'segundos',
    explicacao:
      'Entre dois relatos da mesma pessoa ou da mesma conexão. Antes disso, a ferramenta pede para esperar alguns segundos. Zero desliga.',
    minimo: 0,
  },
]

/** Os seis campos como estao escritos: o rascunho e texto, e so vira numero ao conferir. */
type Rascunho = Record<keyof ReportLimitValues, string>

function comoTexto(valores: ReportLimitValues): Rascunho {
  return Object.fromEntries(CAMPOS.map(({ chave }) => [chave, String(valores[chave])])) as Rascunho
}

/** O numero do campo, ou nulo quando o que esta escrito nao e um numero inteiro. */
function lerNumero(texto: string): number | null {
  const limpo = texto.trim()
  return /^\d+$/.test(limpo) ? Number.parseInt(limpo, 10) : null
}

/** O que esta errado no campo, ou nulo. */
function erroDoCampo(texto: string, minimo: number, teto: number): string | null {
  if (texto.trim().length === 0) return 'Escreva um número.'
  const numero = lerNumero(texto)
  if (numero === null || numero < minimo || numero > teto)
    return `Use um número inteiro de ${minimo} a ${teto}.`
  return null
}

/** Os dois dizem o mesmo? Pelo numero quando os dois sao numero ("08" e "8"), senao pelo texto. */
function iguais(a: Rascunho, b: Rascunho): boolean {
  return CAMPOS.every(({ chave }) => {
    const x = lerNumero(a[chave])
    const y = lerNumero(b[chave])
    return x !== null && y !== null ? x === y : a[chave].trim() === b[chave].trim()
  })
}

/** O que esta mudado em relacao ao de fabrica, com o nome de cada limite — o resumo da aba Proteção. */
export function limitChanges(limites: ReportLimitsViewModel | null): string[] {
  if (!limites) return []
  return CAMPOS.filter(({ chave }) => limites.Values[chave] !== limites.Defaults[chave]).map(
    ({ rotulo, unidade }) => `${rotulo} ${unidade}`,
  )
}

/**
 * Os limites de relato: a leitura, o que vale agora e o editor aberto ou fechado.
 *
 * **Mora fora da secao** porque a tela de Domínios guarda as abas montadas: o rascunho e
 * o aviso de sair sem salvar sobrevivem a troca de aba. O "Voltar ao padrão" do resumo
 * abre o editor ja com os de fabrica.
 */
export function useReportLimits(projectPublicId: string) {
  const { data, loading, failed, reload } = useAsyncResource(
    useCallback(
      () => projectReportLimitsService.getReportLimits(projectPublicId),
      [projectPublicId],
    ),
  )

  const [atual, setAtual] = useState<ReportLimitsViewModel | null>(null)
  /** O editor aberto, com os seis campos como estao escritos. Nulo e o editor fechado. */
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)
  /** Os campos que ja perderam o foco: o erro de "vazio" so aparece depois de sair dele. */
  const [tocados, setTocados] = useState<ReadonlySet<keyof ReportLimitValues>>(() => new Set())

  useEffect(() => setAtual(data), [data])

  function abrir(valores?: ReportLimitValues) {
    if (!atual) return
    setRascunho(comoTexto(valores ?? atual.Values))
    setTocados(new Set())
  }

  async function salvar(valores: ReportLimitValues) {
    if (salvando) return
    setSalvando(true)
    try {
      const gravado = await projectReportLimitsService.saveReportLimits(projectPublicId, valores)
      setAtual(gravado)
      setRascunho(null)
      setTocados(new Set())
      toast.done('Limites salvos. Valem a partir do próximo relato.')
    } catch (falha) {
      toast.error(describeError(falha, 'salvar os limites'))
    } finally {
      setSalvando(false)
    }
  }

  return {
    atual,
    loading,
    failed,
    reload,
    rascunho,
    setRascunho,
    tocados,
    setTocados,
    salvando,
    abrir,
    /** "Voltar ao padrão": o editor abre com os de fabrica, e quem grava e o Salvar. */
    voltarAoPadrao: () => abrir(atual?.Defaults),
    fechar: () => {
      setRascunho(null)
      setTocados(new Set())
    },
    salvar,
  }
}

type Limites = ReturnType<typeof useReportLimits>

/**
 * "Limites de relatos": quantos relatos o projeto aceita em pouco tempo.
 *
 * **Mora em Domínios, na aba Proteção**, junto do resto da protecao do site: o dominio
 * diz de onde o relato pode vir, e o limite diz quantos. **Passou do limite, a
 * ferramenta confere** — um "Conferindo…" de um ou dois segundos que quem relata nem
 * percebe; **no dobro, pausa** por alguns minutos e o sino de quem administra avisa.
 *
 * **Grava como um item de lista, e nao numa barra**: Domínios e uma tela de listas, que
 * gravam na hora, e uma barra de "alteracoes nao salvas" no meio delas nao diria o que
 * vai. Fechado, mostra os numeros que valem; "Alterar limites" abre o editor, com Salvar
 * e Cancelar — como editar uma etapa ou uma coluna. Sair com o editor mudado pergunta.
 *
 * **Um nome so para o reset: "Voltar ao padrão".** O resumo de cima dizia "Voltar ao
 * padrão" e o editor "Voltar aos de fábrica", para a mesma coisa. Com o editor aberto, o
 * do resumo sai: dois botoes iguais na mesma tela fariam perguntar qual e qual.
 */
export function ReportLimitsSection({ limits }: { limits: Limites }) {
  const base = useId()
  const { atual, rascunho, setRascunho, tocados, setTocados, salvando } = limits

  const erros =
    atual && rascunho
      ? Object.fromEntries(
          CAMPOS.map((campo) => [
            campo.chave,
            erroDoCampo(rascunho[campo.chave], campo.minimo, atual.Ceilings[campo.chave]),
          ]),
        )
      : {}
  const invalido = Object.values(erros).some((erro) => erro !== null)
  const valores: ReportLimitValues | null =
    rascunho && !invalido
      ? (Object.fromEntries(
          CAMPOS.map(({ chave }) => [chave, lerNumero(rascunho[chave]) as number]),
        ) as unknown as ReportLimitValues)
      : null

  const mudou = atual !== null && rascunho !== null && !iguais(comoTexto(atual.Values), rascunho)
  const diaMenor = valores !== null && valores.PerProjectPerDay < valores.PerProjectPerHour
  const deFabrica =
    atual !== null && rascunho !== null && iguais(comoTexto(atual.Defaults), rascunho)
  const mudancas = limitChanges(atual)

  return (
    <section id="limites" className="scroll-mt-6">
      <h3 tabIndex={-1} className="mb-1 font-semibold text-body outline-none">
        Limites de relatos
      </h3>
      <p className="mb-2 text-detail text-fg-muted leading-relaxed">
        Quantos relatos o projeto aceita em pouco tempo: a proteção contra robôs e abuso.
      </p>

      <HowItWorks>
        <p>
          Passou de um limite, a ferramenta confere se quem envia é uma pessoa — um “Conferindo…” de
          um ou dois segundos; no dobro, pausa os envios
          {atual ? ` por ${atual.PauseMinutes} minutos` : ''} e avisa no sino.
        </p>
        <p>
          O domínio diz de onde o relato pode vir; o limite diz quantos. Quem fala direto com a
          nossa API declara o domínio que quiser, e por isso existem também os limites por IP e por
          projeto.
        </p>
      </HowItWorks>

      {/* O resumo do que saiu do de fabrica, como no "Mais opções" das outras telas:
          quem herdou o projeto ve na hora se alguem mexeu. */}
      {atual && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-sunken px-3 py-2">
          <p className="min-w-0 flex-1 text-detail text-fg-muted">{describeChanges(mudancas)}</p>
          {!rascunho && mudancas.length > 0 && (
            <Button size="sm" variant="quiet" onClick={limits.voltarAoPadrao}>
              Voltar ao padrão
            </Button>
          )}
        </div>
      )}

      <LeaveGuard when={mudou && !salvando} />

      {limits.failed && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar os limites agora. Nada mudou: os de sempre continuam valendo.
          </p>
          <Button onClick={limits.reload}>Tentar de novo</Button>
        </div>
      )}

      {limits.loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-64" />
        </div>
      )}

      {atual && !rascunho && (
        <>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {CAMPOS.map((campo) => (
              <div
                key={campo.chave}
                id={ANCORAS[campo.chave]}
                className="flex scroll-mt-6 items-baseline justify-between gap-3 border-border border-b py-1.5"
              >
                <dt className="text-detail text-fg-muted">
                  {campo.rotulo} <span className="text-caption">{campo.unidade}</span>
                </dt>
                <dd className="text-body text-fg tabular-nums">{atual.Values[campo.chave]}</dd>
              </div>
            ))}
          </dl>
          <Button className="mt-4" onClick={() => limits.abrir()}>
            Alterar limites
          </Button>
        </>
      )}

      {atual && rascunho && (
        <>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {CAMPOS.map((campo) => {
              const id = `${base}-${campo.chave}`
              const teto = atual.Ceilings[campo.chave]
              const erro = erros[campo.chave] ?? null
              const mostrarErro =
                erro !== null && (tocados.has(campo.chave) || rascunho[campo.chave].trim() !== '')
              const doDia = campo.chave === 'PerProjectPerDay' && diaMenor
              return (
                <div key={campo.chave} id={ANCORAS[campo.chave]} className="scroll-mt-6">
                  <label
                    id={`${id}-rotulo`}
                    htmlFor={id}
                    className="mb-1.5 block text-detail text-fg"
                  >
                    {campo.rotulo}
                  </label>
                  <div className="mb-1 flex items-center gap-2">
                    <NumberField
                      id={id}
                      inputMode="numeric"
                      width="w-16"
                      min={campo.minimo}
                      max={teto}
                      value={rascunho[campo.chave]}
                      disabled={salvando}
                      ariaLabelledBy={`${id}-rotulo ${id}-unidade`}
                      ariaDescribedBy={[
                        mostrarErro ? `${id}-erro` : null,
                        doDia ? `${base}-dia-menor` : null,
                        `${id}-explicacao`,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      invalid={mostrarErro || doDia}
                      onChange={(texto) => setRascunho({ ...rascunho, [campo.chave]: texto })}
                      onBlur={() => setTocados((antes) => new Set(antes).add(campo.chave))}
                    />
                    <span id={`${id}-unidade`} className="text-detail text-fg-muted">
                      {campo.unidade}
                    </span>
                  </div>
                  {mostrarErro && (
                    <p id={`${id}-erro`} className="mb-1 text-caption text-error-fg">
                      {erro}
                    </p>
                  )}
                  <p id={`${id}-explicacao`} className="text-caption text-fg-muted leading-relaxed">
                    {campo.explicacao} De fábrica: {atual.Defaults[campo.chave]}; até {teto}.
                  </p>
                </div>
              )
            })}
          </div>

          {diaMenor && (
            <p id={`${base}-dia-menor`} role="alert" className="mt-4 text-caption text-warn-fg">
              O limite por dia precisa ser pelo menos o limite por hora.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={!mudou || salvando || diaMenor || invalido}
              onClick={() => valores && void limits.salvar(valores)}
            >
              {salvando ? 'Salvando…' : 'Salvar limites'}
            </Button>
            <Button variant="ghost" disabled={salvando} onClick={limits.fechar}>
              Cancelar
            </Button>
            {!deFabrica && (
              <Button
                variant="ghost"
                disabled={salvando}
                onClick={() => {
                  setRascunho(comoTexto(atual.Defaults))
                  setTocados(new Set())
                }}
              >
                Voltar ao padrão
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

/**
 * A ancora de cada limite: a busca da configuracao leva ao campo. Escritas aqui, e nao
 * montadas da chave, para quem procura `limite-por-ip` no codigo achar onde ele mora.
 */
const ANCORAS: Record<keyof ReportLimitValues, string> = {
  PerReporter: 'limite-por-pessoa',
  PerIpPerHour: 'limite-por-ip',
  PerOriginPerHour: 'limite-por-dominio',
  PerProjectPerHour: 'limite-do-projeto-hora',
  PerProjectPerDay: 'limite-do-projeto-dia',
  MinIntervalSeconds: 'intervalo-minimo',
}
