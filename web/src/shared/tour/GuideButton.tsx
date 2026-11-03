import { useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'
import {
  type GuideStep,
  guideTarget,
  jaApresentouOGuia,
  marcarGuiaApresentado,
  useGuideStore,
} from '@/shared/tour/guideStore'
import { acharAlvo, ScreenGuide } from '@/shared/tour/ScreenGuide'

/** Quanto esperar a tela assentar antes de o balao da primeira vez aparecer. */
const BALAO_MS = 900

/**
 * O "Guia da tela", na barra de cima: sempre no mesmo lugar, para quem aprendeu onde
 * fica numa tela achar em todas. So aparece quando a tela da vez tem roteiro.
 *
 * **Nome, e nao so um "?".** Um ponto de interrogacao sozinho se confunde com
 * enfeite, e "Como funciona" ja e a ajuda recolhida dentro das telas. No celular fica
 * so o desenho, com o nome para o leitor de tela.
 *
 * **Na primeira visita ao painel, um balao aponta para ele**, uma vez so, e nao o guia
 * abrindo sozinho: quem entra para trabalhar nao quer ser interrompido. Ele diz que o
 * guia existe em toda tela e nao volta em nenhuma.
 */
export function GuideButton({
  noDialogo = false,
  compacto = false,
}: {
  /** O botao de dentro de um dialogo (o card): serve ao guia dele, e o da barra se cala. */
  noDialogo?: boolean
  /** So o desenho, do tamanho dos botoes do cabecalho do dialogo. */
  compacto?: boolean
} = {}) {
  const tela = useGuideStore((estado) => estado.tela)
  const aberto = useGuideStore((estado) => estado.aberto)
  const abrir = useGuideStore((estado) => estado.abrir)
  const fechar = useGuideStore((estado) => estado.fechar)
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

  useEffect(() => {
    setBalao(false)
    if (!id || jaApresentouOGuia()) return
    const espera = window.setTimeout(() => {
      const caixa = raiz.current?.getBoundingClientRect()
      setPelaEsquerda(caixa ? caixa.left + caixa.width / 2 < window.innerWidth / 2 : false)
      setBalao(true)
    }, BALAO_MS)
    return () => window.clearTimeout(espera)
  }, [id])

  // Mostrado uma vez, o guia esta apresentado: o balao nao volta em tela nenhuma, responda
  // a pessoa ou nao.
  useEffect(() => {
    if (balao) marcarGuiaApresentado()
  }, [balao])

  if (!meu) return null

  function verOGuia() {
    if (!meu) return
    setBalao(false)
    setPassosNaTela(meu.passos.filter((passo) => !passo.alvo || acharAlvo(passo.alvo)))
    abrir()
  }

  return (
    <div ref={raiz} className="relative flex-none">
      <button
        type="button"
        onClick={verOGuia}
        aria-label="Guia da tela"
        title="Guia da tela"
        {...guideTarget('guia')}
        className={
          compacto
            ? 'flex size-8 flex-none items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg'
            : 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 text-detail text-fg-muted transition-all duration-150 hover:bg-surface-sunken hover:text-fg active:scale-95 motion-reduce:transition-none sm:px-2.5'
        }
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
        {!compacto && <span className="hidden sm:inline">Guia da tela</span>}
      </button>

      {balao && !aberto && (
        <section
          aria-label="Guia da tela"
          className={cn(
            'absolute top-full z-toast mt-2.5 w-72 animate-menu-in rounded-xl border border-border bg-surface-raised p-4 shadow-lg dark:bg-surface-strong',
            pelaEsquerda ? 'left-0 origin-top-left' : 'right-0 origin-top-right',
          )}
        >
          {/* A ponta do balao, apontando para o botao. */}
          <span
            aria-hidden="true"
            className={cn(
              '-top-1.5 absolute size-3 rotate-45 border-border border-t border-l bg-surface-raised dark:bg-surface-strong',
              pelaEsquerda ? 'left-2.5' : 'right-5',
            )}
          />
          <p aria-live="polite" className="text-detail text-fg leading-relaxed">
            Em cada tela, este guia mostra para que serve cada parte, em menos de um minuto.
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

      {aberto && passosNaTela.length > 0 && <ScreenGuide passos={passosNaTela} aoFechar={fechar} />}
    </div>
  )
}
