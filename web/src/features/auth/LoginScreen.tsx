import { useEffect, useRef, useState } from 'react'
import { environment } from '@/data'
import { AccessSteps } from '@/features/auth/AccessSteps'
import { renderGoogleButton } from '@/features/auth/googleIdentity'
import { ProductShowcase } from '@/features/auth/ProductShowcase'
import { useSessionStore } from '@/features/auth/sessionStore'
import { Brand } from '@/shared/components/Brand'
import { Reveal } from '@/shared/components/Reveal'
import { cn } from '@/shared/lib/cn'

/**
 * A tela de quem ainda nao entrou.
 *
 * Nao e um formulario: e a porta de entrada do produto. O `RequireSession`
 * mostra esta tela em **qualquer** endereco do painel, inclusive num link que um
 * colega mandou — quem cai aqui quase nunca sabe o que e o PDS.
 *
 * **Um alvo de clique so, repetido tres vezes.** "Continuar com o Google" no
 * cabecalho, na chamada e no fecho; nada mais na pagina e botao. Nao ha campo de
 * e-mail, senha ou cadastro porque nao ha o que preencher: a API tem
 * `POST /auth/google` e mais nada, e o primeiro acesso cria conta e usuario no
 * mesmo movimento.
 *
 * Divergencia conhecida: o design escreve "Entrar com e-mail", e o login por
 * senha segue em aberto (E0-12).
 */
export function LoginScreen() {
  const signIn = useSessionStore((state) => state.signIn)
  const status = useSessionStore((state) => state.status)
  const error = useSessionStore((state) => state.error)

  const clientId = environment.googleClientId
  const noTopo = useRef<HTMLDivElement>(null)
  const naChamada = useRef<HTMLDivElement>(null)
  const noFecho = useRef<HTMLDivElement>(null)
  const [googleFailed, setGoogleFailed] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) return

    let cancelled = false
    const receive = (idToken: string) => {
      if (!cancelled) void signIn(idToken)
    }
    const fail = (reason: Error) => {
      if (!cancelled) setGoogleFailed(reason.message)
    }

    // `renderButton` aceita mais de um elemento, e os tres avisam o mesmo
    // destinatario — nao ha estado duplicado entre eles.
    if (noTopo.current) {
      renderGoogleButton(noTopo.current, clientId, receive, { size: 'medium' }).catch(fail)
    }
    for (const alvo of [naChamada, noFecho]) {
      if (alvo.current) {
        renderGoogleButton(alvo.current, clientId, receive, { size: 'large', fit: true }).catch(
          fail,
        )
      }
    }

    return () => {
      cancelled = true
    }
    // `clientId` sai da lista: vem de `environment`, que e lido uma vez no
    // carregamento do modulo e nao muda em tempo de execucao.
  }, [signIn])

  const rolou = useScrolledPast()

  return (
    <div className="bg-surface">
      <header
        className={cn(
          'sticky top-0 border-b bg-surface transition-colors',
          // A borda so aparece depois que o conteudo passa por tras: parada no
          // topo ela desenha um risco solto sob o cabecalho.
          rolou ? 'border-border' : 'border-transparent',
        )}
      >
        <div className="mx-auto flex h-14 max-w-280 items-center gap-6 px-5 lg:px-8">
          <Brand />

          {/* A politica do Google exige o botao desenhado pela biblioteca dele.
              Some abaixo de `sm`: sai de la com largura propria, em pixel, e ao
              lado da marca estoura a linha num telefone estreito. A chamada fica
              visivel sem rolar, e cobre o caso. */}
          <div ref={noTopo} className="ml-auto hidden [color-scheme:light] sm:block" />
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-grid" aria-hidden="true" />

          <div className="relative mx-auto max-w-280 px-5 pt-14 pb-20 text-center lg:px-8 lg:pt-20 lg:pb-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 text-detail text-fg-muted">
              <span className="size-1.5 rounded-full bg-active" aria-hidden="true" />
              Sem cadastro e sem senha
            </span>

            <h1 className="mx-auto mt-6 max-w-[20ch] font-semibold text-fg text-hero tracking-tight md:text-hero-wide lg:text-display">
              O relato do seu usuário, com o contexto técnico junto
            </h1>

            <p className="mx-auto mt-5 max-w-[56ch] text-fg-muted text-lead leading-relaxed">
              Quando algo quebra no seu site, quem está lá relata na hora com navegador, tela e
              erros do console já anexados, e acompanha o andamento como quem acompanha uma entrega.
            </p>

            <Entrada
              alvo={naChamada}
              clientId={clientId}
              status={status}
              aviso={error ?? googleFailed}
            />

            {/* Sem `Reveal`: num notebook a maquete nasce meio dentro da janela, e
                apareceria com a pagina ja parada. */}
            <div className="mx-auto mt-16 max-w-280 text-left">
              <ProductShowcase />
            </div>
          </div>
        </section>

        <section
          id="como-funciona"
          className="border-border border-y bg-surface-sunken px-5 py-20 lg:px-8 lg:py-24"
        >
          <div className="mx-auto max-w-280">
            <Reveal>
              <h2 className="text-center font-semibold text-fg text-hero tracking-tight md:text-hero-wide">
                Três passos e você está dentro
              </h2>

              <p className="mx-auto mt-4 mb-14 max-w-[48ch] text-center text-fg-muted text-lead leading-relaxed">
                Sem formulário para preencher, sem senha para inventar e sem confirmação por e-mail.
              </p>
            </Reveal>

            <AccessSteps />
          </div>
        </section>

        {/* A grade volta aqui: a pagina abre e fecha no mesmo fundo, e o cartao
            levantado no meio dela e o que faz o fecho parecer destino, e nao
            sobra depois dos passos. */}
        <section className="relative overflow-hidden px-5 py-20 lg:px-8 lg:py-24">
          <div className="absolute inset-0 bg-grid" aria-hidden="true" />

          <Reveal className="relative">
            <div className="mx-auto max-w-160 rounded-xl border border-border bg-surface-raised px-6 py-12 text-center lg:px-12">
              <h2 className="font-semibold text-fg text-hero tracking-tight md:text-hero-wide">
                Comece em um clique
              </h2>

              <p className="mx-auto mt-4 max-w-[42ch] text-fg-muted text-lead leading-relaxed">
                Entre com a sua conta Google e o painel abre na hora.
              </p>

              <Entrada
                alvo={noFecho}
                clientId={clientId}
                status={status}
                aviso={error ?? googleFailed}
              />

              {/* As tres duvidas que sobram na hora de clicar: o que o Google
                  entrega, o que acontece com quem ja tem conta, e onde a pessoa
                  vai parar. Respondidas aqui, e nao numa pagina de ajuda. */}
              <div className="mt-10 border-border border-t pt-8">
                {/* Em coluna, e nao lado a lado: dentro do cartao as tres frases
                    quebram no meio, e "e-mail" vira "e-" numa linha e "mail" na
                    outra. Centralizada com o texto a esquerda, a lista le como
                    conferencia — que e o que ela e. */}
                <ul className="mx-auto flex w-fit flex-col items-start gap-3 text-detail text-fg-muted">
                  {GARANTIAS.map((item) => (
                    <li key={item} className="flex items-center gap-2.5">
                      <span
                        className="size-1.5 flex-none rounded-full bg-active"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* A marca e o ano, e nada mais. Ja teve frase de apresentacao, dois menus
          e a lista do que esta por vir: no fim de uma pagina que ja explicou
          tudo, cada um deles era mais uma coisa para ler depois do fim. */}
      <footer className="border-border border-t">
        <div className="mx-auto flex max-w-280 flex-wrap items-center justify-between gap-3 px-5 py-8 lg:px-8">
          <Brand />
          <p className="text-caption text-fg-muted">© {ANO}</p>
        </div>
      </footer>
    </div>
  )
}

/**
 * O unico ponto de acao da pagina, repetido. Sai daqui e nao de tres copias para
 * a frase de apoio nao divergir entre elas — e ela e a que responde a duvida de
 * quem nunca entrou.
 */
function Entrada({
  alvo,
  clientId,
  status,
  aviso,
}: {
  alvo: React.RefObject<HTMLDivElement | null>
  clientId: string | null
  status: string
  aviso: string | null
}) {
  if (!clientId) {
    return (
      // Sem client id nao existe caminho de entrada. Dizer isso e melhor que
      // desenhar um botao que nunca vai funcionar.
      <p
        role="alert"
        className="mx-auto mt-10 max-w-[60ch] rounded-lg border border-error-border px-3.5 py-3 text-detail text-error-fg leading-relaxed"
      >
        Entrada pelo Google não configurada. Preencha <code>VITE_GOOGLE_CLIENT_ID</code> no{' '}
        <code>.env.local</code> do painel e recarregue a página.
      </p>
    )
  }

  return (
    <div className="mt-10 flex flex-col items-center">
      <div className="relative w-full max-w-90">
        <span
          className="-inset-2 absolute animate-halo rounded-xl border border-border"
          aria-hidden="true"
        />
        <div ref={alvo} className="relative [color-scheme:light]" />
      </div>

      <p className="mt-4 text-detail text-fg-muted">
        Primeiro acesso? Sua conta será criada automaticamente.
      </p>

      {/* Uma regiao viva so: o leitor de tela anuncia tanto a espera quanto a
          falha sem dois avisos concorrendo pelo mesmo evento. */}
      <p aria-live="polite" className="mt-2.5 text-detail leading-relaxed empty:mt-0">
        {status === 'loading' && <span className="text-fg-muted">Abrindo a sessão…</span>}
        {aviso && <span className="text-error-fg">{aviso}</span>}
      </p>
    </div>
  )
}

/**
 * Diz se a pagina saiu do topo, sem ouvir `scroll`: o observador acorda duas
 * vezes por visita, e um ouvinte de rolagem acorda a cada quadro para responder
 * a mesma pergunta.
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

const GARANTIAS = [
  'Do Google vêm nome, e-mail e foto',
  'Já tem conta? Entra direto',
  'Você chega no painel de projetos',
]
