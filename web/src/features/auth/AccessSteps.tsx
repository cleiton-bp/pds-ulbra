import { useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * Os tres passos ate estar dentro, contados em imagem antes de em texto.
 *
 * Cada passo tem uma miniatura do que a pessoa vai ver: o botao com o ponteiro
 * em cima, a conta que aparece pronta, o painel com o projeto. Numero e frase
 * sozinhos dizem a mesma coisa que qualquer outro produto diria.
 *
 * **Os passos acendem em sequencia quando a secao entra na tela**, e o fio entre
 * eles se preenche junto. E o que separa uma lista de tres itens de um caminho
 * com comeco e fim — e acontece uma vez, porque e chegada e nao laco.
 */
const PASSOS = [
  {
    title: 'Entre com o Google',
    detail: 'Um clique com a conta que você já tem, sem formulário e sem senha para inventar.',
    Miniatura: BotaoComPonteiro,
  },
  {
    title: 'Comece automaticamente',
    detail: 'Se for seu primeiro acesso a conta é criada na hora, sem cadastro à parte.',
    Miniatura: ContaCriada,
  },
  {
    title: 'Use o painel',
    detail: 'Crie um projeto, copie a chave, cole o script no site e acompanhe os relatos.',
    Miniatura: QuadroPronto,
  },
]

export function AccessSteps() {
  const [lista, acesos] = usePassosAcesos(PASSOS.length)

  return (
    <ol ref={lista} className="grid gap-12 md:grid-cols-3 md:gap-6">
      {PASSOS.map(({ title, detail, Miniatura }, indice) => {
        const aceso = indice < acesos

        return (
          <li key={title} className="text-center">
            <div
              className={cn(
                'flex h-36 items-center justify-center rounded-xl border bg-surface-raised transition-colors duration-500',
                aceso ? 'border-fg-disabled' : 'border-border',
              )}
            >
              <Miniatura />
            </div>

            {/* O fio vive neste embrulho, que tem a largura da coluna: comecando
                em `50%+3rem` e medindo `100%-6rem`, ele acaba a 3rem do centro da
                proxima — ou seja, atravessa exatamente o vao da grade. */}
            <div className="relative mt-7 flex justify-center">
              {indice > 0 && (
                <span
                  className={cn(
                    'absolute top-1/2 right-[calc(50%+2rem)] hidden h-px w-[calc(100%-4rem)] transition-colors duration-500 md:block',
                    aceso ? 'bg-accent' : 'bg-border',
                  )}
                  aria-hidden="true"
                />
              )}

              <span
                className={cn(
                  'relative flex size-11 items-center justify-center rounded-full border font-semibold text-lead transition-colors duration-500',
                  aceso
                    ? 'border-transparent bg-accent text-accent-fg'
                    : 'border-border bg-surface-raised text-fg-muted',
                )}
              >
                {indice + 1}
              </span>
            </div>

            <h3 className="mt-5 font-semibold text-fg text-lead">{title}</h3>

            <p className="mx-auto mt-2 max-w-[34ch] text-fg-muted text-body leading-relaxed">
              {detail}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Acende um passo por vez quando a lista entra na tela. Uma vez so: repetir a
 * cada rolagem transformaria o caminho num pisca-pisca.
 */
function usePassosAcesos(quantidade: number, intervalo = 420) {
  const lista = useRef<HTMLOListElement>(null)
  const [acesos, setAcesos] = useState(0)

  // Lido uma vez: quem muda a preferencia no meio da sessao recarrega a pagina.
  const [semMovimento] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )

  useEffect(() => {
    if (semMovimento) {
      setAcesos(quantidade)
      return
    }

    const elemento = lista.current
    if (!elemento) return

    // O `setInterval` nasce dentro do observador, entao a limpeza precisa
    // alcancar os dois — guardar o identificador aqui fora e o que permite isso.
    let relogio: ReturnType<typeof setInterval> | undefined

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada?.isIntersecting) return
        observador.disconnect()

        let quantos = 0
        relogio = setInterval(() => {
          quantos += 1
          setAcesos(quantos)
          if (quantos >= quantidade && relogio) clearInterval(relogio)
        }, intervalo)
      },
      { rootMargin: '0px 0px -15% 0px' },
    )

    observador.observe(elemento)

    return () => {
      observador.disconnect()
      if (relogio) clearInterval(relogio)
    }
  }, [quantidade, intervalo, semMovimento])

  return [lista, acesos] as const
}

/** Passo 1: o unico botao da pagina, com o ponteiro em cima dele. */
function BotaoComPonteiro() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="flex h-10 w-46 items-center justify-center gap-2.5 rounded-lg border border-border bg-surface">
        <span className="size-4 rounded-full border border-fg-disabled" />
        <span className="h-1.5 w-24 rounded bg-surface-strong" />
      </div>

      {/* O contorno na cor da superficie destaca o ponteiro do que estiver
          atras dele, sem precisar de sombra. */}
      <svg
        viewBox="0 0 16 16"
        className="-right-1 -bottom-2.5 absolute size-4 stroke-surface text-fg"
        fill="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 1.5 12.5 8.2 8.1 9 6.4 13.2Z" />
      </svg>
    </div>
  )
}

/** Passo 2: a conta que ninguem preencheu. */
function ContaCriada() {
  return (
    <div className="w-46 rounded-lg border border-border bg-surface p-3.5" aria-hidden="true">
      <div className="flex items-center gap-2.5">
        <span className="size-8 flex-none rounded-full bg-surface-strong" />
        <div className="min-w-0 flex-1">
          <div className="h-1.5 w-20 rounded bg-surface-strong" />
          <div className="mt-2 h-1.5 w-12 rounded bg-surface-sunken" />
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-caption text-fg-muted">
        <span className="flex size-4 flex-none items-center justify-center rounded-full bg-active text-active-fg">
          <svg
            viewBox="0 0 12 12"
            className="size-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.5 6.3 4.7 8.5 9.5 3.7" />
          </svg>
        </span>
        conta criada
      </p>
    </div>
  )
}

/**
 * Passo 3: o quadro, com colunas e cartoes dentro.
 *
 * Antes era uma lateral com duas linhas, e lateral com linhas e o desenho de
 * qualquer coisa. Coluna com cartao dentro so pode ser uma — e e o mesmo quadro
 * que a maquete da chamada mostra em tamanho grande.
 */
const COLUNAS = [
  {
    id: 'recebido',
    cartoes: [
      { id: 'r1', aceso: true },
      { id: 'r2', aceso: false },
    ],
  },
  { id: 'analise', cartoes: [{ id: 'a1', aceso: false }] },
  {
    id: 'resolvido',
    cartoes: [
      { id: 's1', aceso: false },
      { id: 's2', aceso: false },
    ],
  },
]

function QuadroPronto() {
  return (
    <div className="w-60 rounded-lg border border-border bg-surface p-2.5" aria-hidden="true">
      <div className="grid grid-cols-3 items-start gap-2">
        {COLUNAS.map((coluna) => (
          <div key={coluna.id} className="rounded-md bg-surface-sunken p-1.5">
            <div className="h-1 w-3/5 rounded bg-surface-strong" />

            <div className="mt-2 flex flex-col gap-1.5">
              {coluna.cartoes.map((cartao) => (
                <div key={cartao.id} className="rounded border border-border bg-surface p-1.5">
                  {cartao.aceso && (
                    <span className="mb-1.5 block size-1.5 rounded-full bg-active" />
                  )}
                  <div className="h-1 w-full rounded bg-surface-strong" />
                  <div className="mt-1 h-1 w-2/3 rounded bg-surface-strong" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
