import { useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'
import {
  deveApresentarOGuia,
  type GuideStep,
  guiaJaVisto,
  guideTarget,
  marcarGuiaApresentado,
  marcarGuiaVisto,
  nomeDoGuia,
  parteDoNomeDoGuia,
  useGuideStore,
} from '@/shared/tour/guideStore'
import { acharAlvo, ScreenGuide } from '@/shared/tour/ScreenGuide'

/** Quanto esperar a tela assentar antes de o balao da primeira vez aparecer. */
const BALAO_MS = 900

/**
 * O guia da tela, na barra de cima: sempre no mesmo lugar, para quem aprendeu onde fica
 * numa tela achar em todas. So aparece quando a tela da vez tem roteiro.
 *
 * **O nome e o da tela** ("Guia do Trabalho", "Guia da Moderação"), e troca com ela.
 * Com o mesmo "Guia da tela" em todas, quem usava achava que era um guia so, do painel
 * inteiro. Um ponto de interrogacao sozinho se confundia com enfeite, e "Como funciona"
 * ja e a ajuda recolhida dentro das telas. No celular fica so o desenho, com o nome
 * para o leitor de tela.
 *
 * **Um ponto verde marca o guia ainda nao aberto** naquela tela. Chegar numa tela e ver
 * o ponto aparecer diz que ali ha outro guia; abrir apaga o ponto so daquela tela.
 *
 * **Na primeira visita ao painel, um balao aponta para ele**, uma vez so, e nao o guia
 * abrindo sozinho: quem entra para trabalhar nao quer ser interrompido. Ele diz que o
 * guia existe em toda tela e nao volta em nenhuma, a nao ser na Visao geral de cada
 * projeto recem criado.
 */
export function GuideButton({
  noDialogo = false,
  compacto = false,
  noMenuDoCelular = false,
}: {
  /** O botao de dentro de um dialogo (o card): serve ao guia dele, e o da barra se cala. */
  noDialogo?: boolean
  /** So o desenho, do tamanho dos botoes do cabecalho do dialogo. */
  compacto?: boolean
  /**
   * No celular o botao sai da barra e o guia abre pelo menu (`pedir` do `guideStore`): a
   * barra do celular fica so com o menu, o projeto, os avisos e a conta. O balao da
   * primeira visita continua aqui, e diz onde o guia mora.
   */
  noMenuDoCelular?: boolean
} = {}) {
  const tela = useGuideStore((estado) => estado.tela)
  const aberto = useGuideStore((estado) => estado.aberto)
  const abrir = useGuideStore((estado) => estado.abrir)
  const fechar = useGuideStore((estado) => estado.fechar)
  const pedidos = useGuideStore((estado) => estado.pedidos)
  const pedidoNoDialogo = useGuideStore((estado) => estado.pedidoNoDialogo)
  // O ultimo pedido atendido: um botao que monta depois (outra tela) nao abre o guia por um
  // pedido antigo.
  const pedidoAtendido = useRef(pedidos)
  const [balao, setBalao] = useState(false)
  // Os passos cujo alvo esta na tela quando o guia abre: a parte escondida (no celular,
  // atras de um botao) ou que nao existe agora (nenhuma vista salva) sai antes, e o
  // "Passo 3 de 7" nao promete um passo que vai ser pulado.
  const [passosNaTela, setPassosNaTela] = useState<GuideStep[]>([])
  // O balao abre para o lado em que cabe: preso pela esquerda quando o botao esta na
  // metade esquerda da tela (no cabecalho do card, no celular), pela direita no resto.
  const raiz = useRef<HTMLDivElement>(null)
  const [pelaEsquerda, setPelaEsquerda] = useState(false)
  // Cada botao serve ao guia do seu lugar: o da barra, as telas; o do dialogo, o dialogo.
  const meu = tela !== null && tela.noDialogo === noDialogo ? tela : null
  const id = meu?.id ?? null
  const semBalao = meu?.semBalao ?? false
  const nome = id ? nomeDoGuia(id) : 'Guia da tela'
  // Comeca como visto: o ponto so aparece depois de conferir, e nao pisca ao chegar.
  const [visto, setVisto] = useState(true)

  useEffect(() => {
    setVisto(id ? guiaJaVisto(id) : true)
  }, [id])

  useEffect(() => {
    setBalao(false)
    if (!id || semBalao || !deveApresentarOGuia(id)) return
    const espera = window.setTimeout(() => {
      const caixa = raiz.current?.getBoundingClientRect()
      setPelaEsquerda(caixa ? caixa.left + caixa.width / 2 < window.innerWidth / 2 : false)
      setBalao(true)
    }, BALAO_MS)
    return () => window.clearTimeout(espera)
  }, [id, semBalao])

  // Mostrado uma vez, o guia esta apresentado: o balao nao volta em tela nenhuma, responda
  // a pessoa ou nao.
  useEffect(() => {
    if (balao) marcarGuiaApresentado()
  }, [balao])

  // O pedido do menu do celular abre como o clique abriria. Atende o botao do lugar do
  // pedido: a gaveta pede o guia das telas, o menu "⋯" do card pede o do dialogo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o pedido novo e o gatilho
  useEffect(() => {
    if (pedidos === pedidoAtendido.current) return
    pedidoAtendido.current = pedidos
    if (pedidoNoDialogo === noDialogo) verOGuia()
  }, [pedidos])

  if (!meu) return null

  function verOGuia() {
    if (!meu) return
    setBalao(false)
    setPassosNaTela(meu.passos.filter((passo) => !passo.alvo || acharAlvo(passo.alvo)))
    marcarGuiaVisto(meu.id)
    setVisto(true)
    abrir()
  }

  // A tela vazia de Projetos nao gasta o balao, e tambem nao ganha o ponto: ali a pessoa
  // esta criando o primeiro projeto. Com o balao aberto, o ponto e repetido.
  const ponto = !visto && !semBalao && !balao && !aberto

  return (
    <div ref={raiz} className="relative flex-none">
      <button
        type="button"
        onClick={verOGuia}
        aria-label={nome}
        title={nome}
        data-novo={ponto || undefined}
        {...guideTarget('guia')}
        className={cn(
          noMenuDoCelular && 'max-sm:hidden',
          compacto
            ? 'relative flex size-8 flex-none items-center justify-center rounded-lg text-fg-muted pointer-coarse:size-10 transition-colors hover:bg-surface-sunken hover:text-fg'
            : 'relative inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg border pointer-coarse:h-10 pointer-coarse:min-w-10 border-border bg-surface-raised px-2 text-detail text-fg-muted transition-[background-color,color,scale] duration-150 hover:bg-surface-sunken hover:text-fg active:scale-95 motion-reduce:transition-none max-sm:border-transparent max-sm:bg-transparent md:px-2.5',
        )}
      >
        <svg
          viewBox="0 0 16 16"
          className="size-4 flex-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M6.3 6.2a1.75 1.75 0 1 1 2.4 1.62c-.45.2-.7.55-.7 1.03v.4" />
          <circle cx="8" cy="11.3" r="0.5" fill="currentColor" stroke="none" />
        </svg>
        {/* A chave e a tela: o nome novo entra esmaecendo, e a troca se ve. */}
        {!compacto && (
          <span key={id} className="hidden max-w-56 animate-fade-in truncate md:inline">
            {nome}
          </span>
        )}
        {ponto && (
          <span
            aria-hidden="true"
            className="-top-1 -right-1 absolute size-2.5 animate-ponto-novo rounded-full bg-chip-green-glyph ring-2 ring-surface"
          />
        )}
      </button>

      {balao && !aberto && (
        <section
          aria-label="Guia da tela"
          className={cn(
            'z-hint animate-menu-in rounded-xl border border-border bg-surface-raised p-4 shadow-lg dark:bg-surface-strong',
            // No celular, preso logo abaixo da barra e com a largura da tela: ancorado no
            // botao, os 288px do balao passavam da borda esquerda em 320.
            'max-sm:fixed max-sm:inset-x-3 max-sm:top-15 sm:absolute sm:top-full sm:mt-2.5 sm:w-72',
            pelaEsquerda ? 'origin-top-left sm:left-0' : 'origin-top-right sm:right-0',
          )}
        >
          {/* A ponta do balao, apontando para o botao. No celular o balao nao fica
              embaixo do botao, e a ponta apontaria para o lugar errado. */}
          <span
            aria-hidden="true"
            className={cn(
              '-top-1.5 absolute size-3 rotate-45 border-border border-t border-l bg-surface-raised max-sm:hidden dark:bg-surface-strong',
              pelaEsquerda ? 'left-2.5' : 'right-5',
            )}
          />
          <p aria-live="polite" className="text-detail text-fg leading-relaxed">
            {/* No celular o botao nao esta na barra: a frase diz onde o guia mora. */}
            <span className={cn(noMenuDoCelular && 'max-sm:hidden')}>
              Este é o guia {id ? parteDoNomeDoGuia(id) : 'da tela'}, e cada tela do painel tem o
              seu, sempre neste botão.
            </span>
            {noMenuDoCelular && (
              <span className="sm:hidden">
                Cada tela do painel tem um guia, e no celular ele fica no menu.
              </span>
            )}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={verOGuia}>
              Ver o guia
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBalao(false)}>
              Agora não
            </Button>
          </div>
        </section>
      )}

      {aberto && passosNaTela.length > 0 && (
        <ScreenGuide nome={nome} passos={passosNaTela} aoFechar={fechar} />
      )}
    </div>
  )
}
