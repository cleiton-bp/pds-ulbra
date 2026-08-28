import { Fragment, useEffect, useRef, useState } from 'react'
import { Brand } from '@/shared/components/Brand'
import { cn } from '@/shared/lib/cn'

/**
 * O produto acontecendo, em laco e nos dois lados ao mesmo tempo.
 *
 * A esquerda e o site do cliente: o usuario relata, o contexto se anexa sozinho
 * e o relato **vira um item que ele acompanha** — a mesma trilha de uma entrega,
 * com o passo de agora aceso e os proximos apagados. Relatar sem retorno vira
 * caixa de sugestao, e ninguem relata duas vezes numa caixa de sugestao.
 *
 * A direita e o outro lado da mesma trilha: um quadro de trabalho, onde o cartao
 * anda de coluna. **As colunas do quadro sao os passos da trilha** — e por isso
 * que o usuario ve o andamento sem ninguem avisar a mao.
 *
 * **E maquete, e o cartucho "Simulação" fica a vista.** O carregador do site e a
 * fila de relatos ainda nao existem (cards IN-01 e E2-01): nada aqui e captura
 * de tela de algo que roda.
 */
const RELATO = 'O botão de finalizar compra não responde no passo de pagamento.'

/** O que o script recolhe sozinho — a razao de existir do produto. */
const CONTEXTO = ['Chrome 120 · macOS', '1440 × 900', '/checkout', '2 erros no console']

/** A trilha que o usuario ve, e as colunas do quadro. Sao a mesma coisa. */
const TRILHA = ['Recebido', 'Em análise', 'Resolvido']

const ETAPAS = [
  { rotulo: 'O usuário relata', duracao: 4200 },
  { rotulo: 'O contexto vai junto', duracao: 2800 },
  { rotulo: 'Ele acompanha', duracao: 3600 },
  { rotulo: 'A equipe resolve', duracao: 3800 },
]

/** Em que degrau da trilha o relato esta, por etapa. `-1` e "ainda nao existe". */
const DEGRAU = [-1, -1, 0, 1]

export function ProductShowcase() {
  const raiz = useRef<HTMLDivElement>(null)
  const [etapa, setEtapa] = useState(0)
  const [naTela, setNaTela] = useState(false)
  const [digitado, setDigitado] = useState('')

  // Lido uma vez: quem muda a preferencia no meio da sessao recarrega a pagina.
  const [semMovimento] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )

  // Fora da tela o laco para. Nao e economia teatral: sao dois temporizadores
  // redesenhando um bloco que ninguem esta vendo.
  useEffect(() => {
    const elemento = raiz.current
    if (!elemento) return

    const observador = new IntersectionObserver(([entrada]) => setNaTela(!!entrada?.isIntersecting))
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  useEffect(() => {
    if (semMovimento || !naTela) return

    const relogio = setTimeout(
      () => setEtapa((atual) => (atual + 1) % ETAPAS.length),
      ETAPAS[etapa]?.duracao ?? 3000,
    )
    return () => clearTimeout(relogio)
  }, [etapa, naTela, semMovimento])

  useEffect(() => {
    if (semMovimento || etapa !== 0) {
      setDigitado(RELATO)
      return
    }

    let escrito = 0
    setDigitado('')
    const relogio = setInterval(() => {
      escrito += 1
      setDigitado(RELATO.slice(0, escrito))
      if (escrito >= RELATO.length) clearInterval(relogio)
    }, 26)

    return () => clearInterval(relogio)
  }, [etapa, semMovimento])

  // Sem movimento a maquete nao anda: mostra o fim, que e onde a historia chega.
  const passo = semMovimento ? ETAPAS.length - 1 : etapa
  const degrau = DEGRAU[passo] ?? -1

  return (
    <div ref={raiz}>
      <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-0">
        <SiteDoCliente passo={passo} degrau={degrau} digitado={digitado} />

        <Fio ativo={passo === 2} />

        <QuadroDaEquipe degrau={degrau} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {ETAPAS.map((item, indice) => (
          <button
            key={item.rotulo}
            type="button"
            onClick={() => setEtapa(indice)}
            className={cn(
              'flex items-center gap-2 text-detail transition-colors',
              indice === passo ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full transition-colors',
                indice === passo ? 'bg-accent' : 'bg-muted-dot',
              )}
              aria-hidden="true"
            />
            {item.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

function Moldura({
  legenda,
  cartucho,
  children,
}: {
  legenda: string
  cartucho?: string
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-raised text-left">
      <div className="flex items-center gap-2.5 border-border border-b bg-surface-sunken px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-surface-strong" />
          <span className="size-2 rounded-full bg-surface-strong" />
          <span className="size-2 rounded-full bg-surface-strong" />
        </span>

        <span className="min-w-0 truncate rounded-md bg-surface px-2.5 py-1 font-mono text-caption text-fg-muted">
          {legenda}
        </span>

        {cartucho && (
          <span className="ml-auto flex-none rounded-full border border-border px-2 py-0.5 text-caption text-fg-muted">
            {cartucho}
          </span>
        )}
      </div>

      <div className="relative h-88 p-5">{children}</div>
    </div>
  )
}

function SiteDoCliente({
  passo,
  degrau,
  digitado,
}: {
  passo: number
  degrau: number
  digitado: string
}) {
  return (
    <Moldura legenda="loja.exemplo.com/checkout" cartucho="Simulação">
      <div className="flex flex-col gap-3" aria-hidden="true">
        <div className="h-3 w-2/5 rounded bg-surface-strong" />
        <div className="h-2 w-4/5 rounded bg-surface-sunken" />
        <div className="h-2 w-3/5 rounded bg-surface-sunken" />
        <div className="mt-1 grid grid-cols-2 gap-3">
          <div className="h-14 rounded-lg bg-surface-sunken" />
          <div className="h-14 rounded-lg bg-surface-sunken" />
        </div>
      </div>

      {/* Ancorado no rodape, como um widget: crescer para cima e o que ele faz. */}
      <div className="absolute inset-x-4 bottom-4 rounded-xl border border-border bg-surface p-4">
        {degrau < 0 ? (
          <Formulario passo={passo} digitado={digitado} />
        ) : (
          <Acompanhamento degrau={degrau} />
        )}
      </div>
    </Moldura>
  )
}

function Formulario({ passo, digitado }: { passo: number; digitado: string }) {
  return (
    <>
      <h3 className="font-semibold text-fg text-body">Relatar problema</h3>

      <p className="mt-2.5 min-h-11 rounded-lg border border-border bg-surface-sunken px-3 py-2 text-detail text-fg leading-relaxed">
        {digitado}
        {/* O cursor so existe enquanto alguem escreve. Parado depois da ultima
            letra, ele vira um risco que ninguem sabe o que e. */}
        {digitado.length < RELATO.length && (
          <span
            className="ml-px inline-block h-3.5 w-px translate-y-0.5 animate-pulse-soft bg-fg"
            aria-hidden="true"
          />
        )}
      </p>

      {passo >= 1 && (
        <>
          <p className="mt-3 text-caption text-fg-muted">Anexado sozinho, sem ninguém digitar:</p>

          <ul className="mt-2 flex flex-wrap gap-1.5">
            {CONTEXTO.map((item, indice) => (
              <li
                key={item}
                style={{ animationDelay: `${indice * 130}ms` }}
                className="animate-pop rounded-md border border-border px-2 py-0.5 font-mono text-caption text-fg-muted"
              >
                {item}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/** O lado de quem relatou: a mesma trilha de uma entrega. */
function Acompanhamento({ degrau }: { degrau: number }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-fg text-body">Meus relatos</h3>
        <span className="text-caption text-fg-muted">1 aberto</span>
      </div>

      <article className="mt-3 animate-pop rounded-lg border border-border bg-surface-raised p-3">
        <p className="line-clamp-2 text-detail text-fg leading-relaxed">{RELATO}</p>

        <div className="mt-3.5 flex items-center" aria-hidden="true">
          {TRILHA.map((nome, indice) => (
            <Fragment key={nome}>
              <span
                className={cn(
                  'size-2 flex-none rounded-full transition-colors',
                  indice <= degrau ? 'bg-active' : 'bg-muted-dot',
                )}
              />
              {indice < TRILHA.length - 1 && (
                <span
                  className={cn(
                    'h-px flex-1 transition-colors',
                    indice < degrau ? 'bg-active' : 'bg-border',
                  )}
                />
              )}
            </Fragment>
          ))}
        </div>

        <ol className="mt-1.5 flex justify-between text-caption">
          {TRILHA.map((nome, indice) => (
            <li key={nome} className={indice === degrau ? 'font-medium text-fg' : 'text-fg-muted'}>
              {nome}
            </li>
          ))}
        </ol>

        <p className="mt-3 border-border border-t pt-2.5 text-caption text-fg-muted">
          {degrau === 0
            ? 'Recebido agora, e você acompanha por aqui sem precisar perguntar.'
            : 'A equipe pegou o seu relato, e isto muda aqui assim que ele andar.'}
        </p>
      </article>
    </>
  )
}

/** O fio entre os dois lados. So em tela larga: empilhado, a sequencia ja conta. */
function Fio({ ativo }: { ativo: boolean }) {
  return (
    <div className="hidden w-20 items-center px-3 lg:flex" aria-hidden="true">
      <div className="relative h-px w-full bg-border">
        {ativo && (
          <span className="-top-0.5 absolute left-0 size-1.5 animate-travel rounded-full bg-accent [--distancia:3.5rem]" />
        )}
      </div>
    </div>
  )
}

/**
 * O que ja existia em cada coluna. Quadro vazio parece produto novo, e o cartao
 * do relato precisa chegar num lugar onde ja se trabalha. Sao nomes e nao
 * contagem para a chave do React nao virar o indice do laco.
 */
const OCUPACAO = [['recebido-a'], ['analise-a'], ['resolvido-a', 'resolvido-b']]

function QuadroDaEquipe({ degrau }: { degrau: number }) {
  return (
    <Moldura legenda="painel · quadro da equipe">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-border border-b pb-3">
          <Brand />
          <span className="rounded-full border border-border px-2 py-0.5 text-caption text-fg-muted">
            {degrau < 0 ? 'sem novidades' : '1 novo'}
          </span>
        </div>

        <div className="mt-4 grid flex-1 grid-cols-3 items-start gap-2">
          {TRILHA.map((nome, indice) => (
            <div key={nome} className="rounded-lg bg-surface-sunken p-2">
              <p className="px-0.5 pb-2 text-caption text-fg-muted">{nome}</p>

              <div className="flex flex-col gap-2">
                {indice === degrau && (
                  <article className="animate-pop rounded-md border border-border bg-surface p-2">
                    {degrau === 0 && (
                      <span className="rounded-full bg-active px-1.5 py-px text-active-fg text-caption">
                        Novo
                      </span>
                    )}
                    <p className="mt-1.5 line-clamp-3 text-caption text-fg leading-relaxed">
                      {RELATO}
                    </p>
                    <p className="mt-1.5 text-caption text-fg-muted">
                      {CONTEXTO.length} anexos do contexto
                    </p>
                  </article>
                )}

                {(OCUPACAO[indice] ?? []).map((id) => (
                  <div
                    key={id}
                    className="rounded-md border border-border bg-surface p-2"
                    aria-hidden="true"
                  >
                    <div className="h-1.5 w-full rounded bg-surface-strong" />
                    <div className="mt-1.5 h-1.5 w-2/3 rounded bg-surface-strong" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sem citar ferramenta nenhuma: o nome muda de empresa para empresa, e
            prometer uma delas e prometer uma integracao que ainda nao existe. */}
        <p className="mt-4 flex flex-wrap items-center gap-2 text-caption text-fg-muted">
          Ou direto no quadro que a sua equipe já usa
          <span className="rounded-full border border-border px-2 py-0.5">a caminho</span>
        </p>
      </div>
    </Moldura>
  )
}
