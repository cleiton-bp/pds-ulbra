import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { environment } from '@/data'
import { renderGoogleButton } from '@/features/auth/googleIdentity'
import { semMovimento } from '@/features/auth/movimento'
import { MOSTRAR_A_MAQUETE, ProductShowcase } from '@/features/auth/ProductShowcase'
import { useSessionStore } from '@/features/auth/sessionStore'
import { Brand } from '@/shared/components/Brand'
import { Reveal } from '@/shared/components/Reveal'
import { cn } from '@/shared/lib/cn'

/**
 * A tela de quem ainda nao entrou, em dois tamanhos.
 *
 * **Na raiz, e a pagina do produto.** Quem digita o endereco quase sempre veio conhecer:
 * o titulo diz o que e, a chamada fica logo embaixo, e a maquete (`ProductShowcase`) ja
 * aparece na primeira dobra, porque e ela que mostra o produto funcionando. Depois vem as
 * duvidas de quem esta decidindo e o fecho, com o caminho de comeco.
 *
 * **Em qualquer outro endereco, e so a entrada.** O `RequireSession` mostra esta tela no
 * proprio link (o card que um colega mandou, um convite, uma pagina salva), e quem chega
 * por ele veio entrar, e nao ler sobre o produto. A pagina inteira fica a um botao, no
 * mesmo endereco, para o link continuar valendo depois de entrar.
 *
 * Nao ha campo de e-mail, senha ou cadastro porque nao ha o que preencher: a API tem
 * `POST /auth/google` e mais nada, e o primeiro acesso cria conta e usuario no mesmo
 * movimento.
 */
export function LoginScreen() {
  const { pathname } = useLocation()
  const entrada = useEntrada()
  const [conhecer, setConhecer] = useState(false)

  // Quem chega pelo link de um convite cai aqui antes de qualquer coisa, e precisa saber
  // por que esta aqui e com qual conta entrar.
  const convite = pathname === '/invite'

  if (pathname !== '/' && !conhecer) {
    return (
      <SoAEntrada
        convite={convite}
        entrada={entrada}
        aoConhecer={() => {
          setConhecer(true)
          window.scrollTo(0, 0)
        }}
      />
    )
  }

  return <PaginaDoProduto convite={convite} entrada={entrada} />
}

/** O que todo botao do Google da tela divide: para onde vai o token e o que deu errado. */
interface Entrada {
  clientId: string | null
  status: string
  aviso: string | null
  aoToken: (idToken: string) => void
  aoFalhar: (motivo: string) => void
}

function useEntrada(): Entrada {
  const signIn = useSessionStore((state) => state.signIn)
  const status = useSessionStore((state) => state.status)
  const error = useSessionStore((state) => state.error)
  const [falhou, setFalhou] = useState<string | null>(null)
  const aoToken = useCallback((idToken: string) => void signIn(idToken), [signIn])

  return {
    // Lido uma vez no carregamento do modulo, e nao muda em tempo de execucao.
    clientId: environment.googleClientId,
    status,
    aviso: error ?? falhou,
    aoToken,
    aoFalhar: setFalhou,
  }
}

const TAMANHOS = {
  grande: { size: 'large', largura: 272, altura: 'h-10' },
  pequeno: { size: 'medium', largura: 228, altura: 'h-8' },
} as const

/**
 * O botao oficial do Google, que a politica dele exige desenhado pela biblioteca dele.
 *
 * **Branco com a borda cinza do Google, nos dois temas.** E o tema claro dele (`outline`):
 * a borda e desenhada pelo Google e nao aceita cor nossa, e uma borda nossa por fora ficaria
 * dupla. O preenchido de preto pesava na pagina.
 *
 * **Sem piscar branco nem empurrar a pagina.** A biblioteca chega depois da tela, e o botao
 * dela carrega num quadro proprio. Enquanto isso, uma espera do mesmo tamanho, na mesma
 * forma e na mesma cor ocupa o lugar, e da lugar ao botao num esmaecer quando o quadro dele
 * termina de carregar.
 */
function BotaoDoGoogle({
  entrada,
  tamanho = 'grande',
  className,
}: {
  entrada: Entrada
  tamanho?: keyof typeof TAMANHOS
  className?: string
}) {
  const alvo = useRef<HTMLDivElement>(null)
  const [pronto, setPronto] = useState(false)
  const { clientId, aoToken, aoFalhar } = entrada
  const { size, largura, altura } = TAMANHOS[tamanho]

  useEffect(() => {
    const elemento = alvo.current
    if (!clientId || !elemento) return

    let cancelado = false
    setPronto(false)
    const pronto = () => {
      if (!cancelado) setPronto(true)
    }
    const observador = new MutationObserver(() => {
      const quadro = elemento.querySelector('iframe')
      if (!quadro) return
      observador.disconnect()
      quadro.addEventListener('load', pronto, { once: true })
    })
    observador.observe(elemento, { childList: true, subtree: true })
    // Se o quadro nunca avisar, o botao aparece mesmo assim: esperar para sempre seria pior.
    const reserva = setTimeout(pronto, 3000)

    renderGoogleButton(
      elemento,
      clientId,
      (idToken) => {
        if (!cancelado) aoToken(idToken)
      },
      { size, width: largura, shape: 'pill', theme: 'outline' },
    ).catch((motivo: Error) => {
      if (cancelado) return
      aoFalhar(motivo.message)
      setPronto(true)
    })

    return () => {
      cancelado = true
      observador.disconnect()
      clearTimeout(reserva)
    }
  }, [clientId, size, largura, aoToken, aoFalhar])

  return (
    <div className={cn('relative flex-none', altura, className)} style={{ width: largura }}>
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 flex items-center gap-2.5 rounded-full px-3 transition-opacity duration-300 ease-[var(--ease-out)]',
          'border border-border-control bg-surface-raised dark:border-transparent dark:bg-accent',
          pronto ? 'opacity-0' : 'opacity-100',
        )}
      >
        <span className="size-5 flex-none rounded-full bg-surface-strong dark:bg-accent-fg/15" />
        <span className="mx-auto h-2 w-32 animate-pulse-soft rounded-full bg-surface-strong dark:bg-accent-fg/20" />
      </div>
      <div
        ref={alvo}
        className={cn(
          'relative [color-scheme:light] transition-opacity duration-300 ease-[var(--ease-out)]',
          pronto ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}

/** O que acontece depois do clique, numa regiao viva so: a espera e a falha. */
function Situacao({ entrada, anunciar = false }: { entrada: Entrada; anunciar?: boolean }) {
  return (
    <p
      aria-live={anunciar ? 'polite' : undefined}
      className="text-detail leading-relaxed empty:hidden"
    >
      {entrada.status === 'loading' && <span className="text-fg-muted">Abrindo a sessão…</span>}
      {entrada.aviso && <span className="text-error-fg">{entrada.aviso}</span>}
    </p>
  )
}

/** Sem client id nao existe caminho de entrada. Dizer isso e melhor que um botao morto. */
function SemGoogle({ className }: { className?: string }) {
  return (
    <p
      role="alert"
      className={cn(
        'max-w-[60ch] rounded-lg border border-error-border px-3.5 py-3 text-detail text-error-fg leading-relaxed',
        className,
      )}
    >
      Entrada pelo Google não configurada: preencha <code>VITE_GOOGLE_CLIENT_ID</code> no{' '}
      <code>.env.local</code> do painel e recarregue a página.
    </p>
  )
}

/** A entrada sozinha, para quem chegou por um link e so quer passar. */
function SoAEntrada({
  convite,
  entrada,
  aoConhecer,
}: {
  convite: boolean
  entrada: Entrada
  aoConhecer: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="mx-auto flex h-14 w-full max-w-280 items-center gap-6 px-4 sm:px-5 lg:px-8">
        <Brand />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pt-6 pb-16">
        <div className="w-full max-w-100 animate-materializa rounded-xl border border-border bg-surface-raised p-6 sm:p-8">
          <h1 className="font-semibold text-fg text-notice tracking-tight">
            {convite ? 'Você recebeu um convite para um time' : 'Entre para continuar'}
          </h1>
          <p className="mt-2 text-body text-fg-muted leading-relaxed">
            {convite
              ? 'Entre com a conta Google do e-mail em que o convite chegou, e ele abre aqui mesmo.'
              : 'Depois de entrar, você volta direto para a página que estava abrindo.'}
          </p>

          {entrada.clientId ? (
            <div className="mt-6 flex flex-col gap-3">
              <BotaoDoGoogle entrada={entrada} />
              <p className="text-detail text-fg-muted">
                No primeiro acesso, a conta é criada na hora.
              </p>
              <Situacao entrada={entrada} anunciar />
            </div>
          ) : (
            <SemGoogle className="mt-6" />
          )}

          <p className="mt-6 border-border border-t pt-4 text-detail text-fg-muted">
            Ainda não conhece?{' '}
            <button
              type="button"
              onClick={aoConhecer}
              className="text-fg underline underline-offset-4 transition-colors duration-150 hover:text-fg-muted"
            >
              Ver como funciona
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}

/** Uma linha do titulo, que sobe de dentro da propria mascara. */
function Linha({ children, atraso = 0 }: { children: React.ReactNode; atraso?: number }) {
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <span className="block animate-sobe-da-mascara" style={{ animationDelay: `${atraso}ms` }}>
        {children}
      </span>
    </span>
  )
}

/** A pagina do produto, para quem veio conhecer. */
function PaginaDoProduto({ convite, entrada }: { convite: boolean; entrada: Entrada }) {
  const rolou = useScrolledPast()

  // Leva a maquete ao centro da atencao e chama o guia dela: quem pediu para experimentar
  // ve, sem procurar, onde clicar primeiro.
  function irParaOExemplo() {
    document
      .getElementById('experimente')
      ?.scrollIntoView({ behavior: semMovimento() ? 'auto' : 'smooth', block: 'start' })
    window.dispatchEvent(new CustomEvent(MOSTRAR_A_MAQUETE))
  }

  return (
    <div className="min-h-dvh bg-surface">
      <header
        className={cn(
          'sticky top-0 z-sticky border-b bg-surface transition-colors',
          // A borda so aparece depois que o conteudo passa por tras: parada no topo ela
          // desenha um risco solto sob o cabecalho.
          rolou ? 'border-border' : 'border-transparent',
        )}
      >
        <div className="mx-auto flex h-14 max-w-280 items-center gap-6 px-4 sm:px-5 lg:px-8">
          <Brand />

          <div className="ml-auto flex items-center gap-3">
            {/* Sem o botao de tema: a entrada segue o tema do sistema da pessoa, ou o que ela
                ja escolheu dentro do painel. */}
            {/* Some abaixo de `sm`: ao lado da marca o botao estoura a linha num telefone
                estreito, e a chamada logo abaixo cobre o caso. */}
            {entrada.clientId && (
              <BotaoDoGoogle entrada={entrada} tamanho="pequeno" className="max-sm:hidden" />
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-280 px-4 pt-12 sm:px-5 lg:px-8 lg:pt-20">
          {convite && (
            <div className="mb-10 max-w-[52ch] animate-materializa rounded-xl border border-border bg-surface-raised px-5 py-4">
              <p className="font-medium text-body text-fg">Você recebeu um convite para um time</p>
              <p className="mt-1 text-detail text-fg-muted leading-relaxed">
                Entre com a conta Google do e-mail em que o convite chegou, e ele abre aqui mesmo.
              </p>
            </div>
          )}

          {/* O titulo em duas linhas que sobem da mascara, uma atras da outra; o resto chega
              logo depois, e nada espera a animacao para poder ser clicado. */}
          <h1 className="max-w-[21ch] font-semibold text-fg text-hero tracking-tight md:text-hero-wide lg:text-display xl:text-headline">
            <Linha>Relatos do seu sistema</Linha>{' '}
            <Linha atraso={90}>direto no quadro do time</Linha>
          </h1>

          <div className="mt-6 flex flex-col gap-7 lg:mt-8 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
            <p className="max-w-[50ch] animate-materializa text-fg-muted text-lead leading-relaxed [animation-delay:180ms]">
              Quem usa clica em Relatar e recebe um protocolo, e cada vez que o time move o card, a
              pessoa vê a etapa mudar sem precisar perguntar.
            </p>

            <div className="flex flex-none animate-materializa flex-col gap-3 [animation-delay:260ms] lg:items-end">
              {entrada.clientId ? (
                <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap lg:justify-end">
                  <BotaoDoGoogle entrada={entrada} />
                  <BotaoDeExperimentar aoClicar={irParaOExemplo} />
                </div>
              ) : (
                <>
                  <SemGoogle />
                  <BotaoDeExperimentar aoClicar={irParaOExemplo} />
                </>
              )}
              <p className="text-caption text-fg-muted">
                No primeiro acesso, a conta é criada na hora.
              </p>
              <Situacao entrada={entrada} anunciar />
            </div>
          </div>
        </section>

        {/* Logo abaixo da chamada, para a maquete aparecer na primeira dobra: e ela que mostra
            o produto. Sem `Reveal`: num notebook ela nasce meio dentro da janela. */}
        <section
          aria-labelledby="experimente"
          className="mx-auto max-w-280 px-4 pt-10 pb-20 sm:px-5 lg:px-8 lg:pt-12 lg:pb-28"
        >
          {/* A mesa: um campo solido no verde de "funcionando", e nao um degrade, embaixo da
              maquete inteira. Passa um pouco da coluna do texto na tela larga, para o titulo
              da maquete seguir alinhado ao da pagina, e vai de ponta a ponta no celular. */}
          <div className="rounded-3xl bg-landing-mat px-2 py-8 max-sm:-mx-4 max-sm:rounded-none sm:px-6 sm:py-10 lg:-mx-6">
            <ProductShowcase
              fim={entrada.clientId ? <BotaoDoGoogle entrada={entrada} /> : undefined}
            />
          </div>
        </section>

        <section aria-labelledby="perguntas">
          <div className="mx-auto max-w-280 px-4 pt-4 pb-16 sm:px-5 lg:px-8 lg:pt-8 lg:pb-24">
            <Reveal>
              <h2
                id="perguntas"
                className="font-semibold text-fg text-hero tracking-tight md:text-hero-wide"
              >
                Antes de começar
              </h2>
            </Reveal>

            {/* Respostas a vista, e nao numa sanfona: sao seis frases, e abrir uma por uma
                seria trabalho para ler o que cabe na tela. */}
            <dl className="mt-10 grid gap-x-16 gap-y-9 md:grid-cols-2">
              {PERGUNTAS.map(({ pergunta, resposta }, indice) => (
                <Reveal key={pergunta} delay={(indice % 2) * 70}>
                  <dt className="font-medium text-fg text-lead">{pergunta}</dt>
                  <dd className="mt-1.5 max-w-[56ch] text-body text-fg-muted leading-relaxed">
                    {resposta}
                  </dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        <section
          aria-labelledby="comece"
          className="mx-auto max-w-280 px-4 pb-20 sm:px-5 lg:px-8 lg:pb-28"
        >
          <Fecho entrada={entrada} />
        </section>
      </main>

      {/* A marca e o ano, e nada mais: no fim de uma pagina que ja explicou tudo, cada coisa
          a mais seria mais uma para ler depois do fim. */}
      <footer className="border-border border-t">
        <div className="mx-auto flex max-w-280 flex-wrap items-center justify-between gap-3 px-4 py-8 sm:px-5 lg:px-8">
          <Brand />
          <p className="text-caption text-fg-muted">© {ANO}</p>
        </div>
      </footer>
    </div>
  )
}

/**
 * A segunda acao do topo: um botao de verdade, feito do mesmo verde da mesa da maquete,
 * para onde ele leva, com a seta que desce quando o mouse chega.
 */
function BotaoDeExperimentar({ aoClicar }: { aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="group inline-flex h-10 items-center gap-2 rounded-full border border-chip-green-border bg-landing-mat px-4 text-body text-landing-mat-fg transition-[background-color,scale] duration-150 ease-[var(--ease-out)] hover:bg-landing-mat-strong active:scale-[0.97] pointer-coarse:h-11"
    >
      Experimentar sem entrar
      <svg
        viewBox="0 0 12 12"
        className="size-3 transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-y-0.5"
        aria-hidden="true"
      >
        <path
          d="M6 2.5v7M3 6.5l3 3 3-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/** O caminho de comeco, no desenho do trilho dos primeiros passos. */
const COMECO = [
  'Entrar com o Google',
  'Criar o projeto',
  'Colar a linha no sistema',
  'Autorizar o endereço',
]

/**
 * O fecho: o mesmo verde claro da mesa da maquete, com o texto em tinta (o verde-escuro com
 * letra clara pesava e se lia mal), e o caminho de comeco no desenho do trilho, que se
 * enche de verde. Ao entrar na tela o trilho se faz uma vez, no a no, da esquerda para a direita.
 * O caminho inteiro, com o endereco autorizado: e o passo que a promessa de "cole uma
 * linha" escondia, e quem descobre depois se sente enganado.
 */
function Fecho({ entrada }: { entrada: Entrada }) {
  const lista = useRef<HTMLOListElement>(null)
  const [visto, setVisto] = useState(false)

  useEffect(() => {
    const elemento = lista.current
    if (!elemento) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisto(true)
      return
    }
    const observador = new IntersectionObserver(
      ([registro]) => {
        if (!registro?.isIntersecting) return
        setVisto(true)
        observador.disconnect()
      },
      { rootMargin: '0px 0px -15% 0px' },
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  return (
    <div className="grid gap-10 rounded-3xl bg-landing-mat px-6 py-10 text-fg sm:px-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end lg:gap-16 lg:px-14 lg:py-14">
      <div>
        <h2 id="comece" className="font-semibold text-hero tracking-tight md:text-hero-wide">
          Comece pelo primeiro projeto
        </h2>
        <p className="mt-3 max-w-[46ch] text-fg-muted text-lead leading-relaxed">
          Do primeiro acesso ao primeiro relato de teste no quadro, o caminho é este.
        </p>

        <ol ref={lista} className="mt-9 grid grid-cols-2 gap-y-7 sm:grid-cols-4">
          {COMECO.map((rotulo, indice) => (
            <li key={rotulo} className="relative pr-4">
              {indice < COMECO.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-[5px] right-0 left-4 h-px bg-chip-green-border max-sm:hidden"
                >
                  <span
                    style={{ transitionDelay: `${indice * 170 + 140}ms` }}
                    className={cn(
                      'block h-full origin-left bg-landing-done transition-transform duration-500 ease-[var(--ease-in-out)] motion-reduce:transition-none',
                      visto ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </span>
              )}
              <span
                aria-hidden="true"
                style={{ transitionDelay: `${indice * 170}ms` }}
                className={cn(
                  'block size-3 rounded-full border-2 border-landing-done transition duration-300 ease-[var(--ease-out)] motion-reduce:transition-none',
                  // O ultimo passo, onde o caminho chega, assenta maior.
                  visto
                    ? cn(
                        'bg-landing-done',
                        indice === COMECO.length - 1 ? 'scale-125' : 'scale-100',
                      )
                    : 'scale-75 bg-transparent',
                )}
              />
              <span className="mt-3 block text-detail text-fg leading-snug">{rotulo}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-3 lg:items-end">
        {entrada.clientId ? (
          <>
            <BotaoDoGoogle entrada={entrada} />
            <p className="text-caption text-fg-muted">
              No primeiro acesso, a conta é criada na hora.
            </p>
          </>
        ) : (
          <SemGoogle className="bg-surface-raised" />
        )}
      </div>
    </div>
  )
}

/**
 * Diz se a pagina saiu do topo, sem ouvir `scroll`: o observador acorda duas vezes por
 * visita, e um ouvinte de rolagem acorda a cada quadro para responder a mesma pergunta.
 */
function useScrolledPast(): boolean {
  const [passou, setPassou] = useState(false)

  useEffect(() => {
    const marco = document.createElement('div')
    marco.style.cssText = 'position:absolute;top:0;height:1px;width:1px'
    document.body.appendChild(marco)

    const observador = new IntersectionObserver(([entrada]) => setPassou(!entrada?.isIntersecting))
    observador.observe(marco)

    return () => {
      observador.disconnect()
      marco.remove()
    }
  }, [])

  return passou
}

const ANO = new Date().getFullYear()

/**
 * O que quem esta decidindo pergunta antes de entrar, com a resposta numa frase. Cada uma
 * e um fato do produto de fabrica, e nao promessa: privado de fabrica, protocolo sem
 * cadastro, senha fora do print, reabertura de volta a primeira coluna.
 */
const PERGUNTAS = [
  {
    pergunta: 'Precisa de programador para instalar?',
    resposta:
      'Só para colar uma linha no seu sistema, e o painel já monta o recado pronto para quem cuida dele.',
  },
  {
    pergunta: 'Quem relata precisa criar conta?',
    resposta:
      'Não, a pessoa recebe um protocolo e acompanha tudo pelo link, sem cadastro e sem senha.',
  },
  {
    pergunta: 'Os relatos ficam públicos?',
    resposta:
      'De fábrica, só o time vê, e abrir os relatos ao público é uma escolha de cada projeto.',
  },
  {
    pergunta: 'O que chega junto com o relato?',
    resposta:
      'As respostas às perguntas do tipo, o print marcado pela pessoa, a página em que ela estava e o navegador.',
  },
  {
    pergunta: 'O print pode mostrar um dado sensível?',
    resposta:
      'Campos de senha ficam fora da captura, e qualquer outro trecho sai também se você o marcar no seu sistema.',
  },
  {
    pergunta: 'O time precisa mudar o jeito de trabalhar?',
    resposta:
      'Não, o projeto nasce de um modelo pronto, do quadro simples ao Scrum, e as colunas continuam suas para mudar.',
  },
]
