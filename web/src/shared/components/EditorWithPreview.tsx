import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react'
import { BottomSheet } from '@/shared/components/BottomSheet'
import { PreviaNaAltura, PreviaNaFolha } from '@/shared/components/PreviewSection'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'
import { guideTarget } from '@/shared/tour/guideStore'

/**
 * O editor de duas colunas das telas que mudam o que se ve — O botão, Formulário,
 * Anexos, Tipos de relato: **a esquerda, os controles; a direita, a previa presa ao
 * rolar**, a partir de `lg`. A previa no meio da coluna fazia quem mexia la embaixo rolar
 * para cima e para baixo a cada mudanca. Abaixo de `lg`, uma coluna, com a previa no
 * topo.
 *
 * **60% para os controles, 40% para a previa.** Metade e metade apertava o que se
 * configura (o passo a passo com codigo, na Privacidade, ficava estreito demais), e a
 * previa cabe inteira em menos: o formulario dela tem a largura de um formulario.
 *
 * **Os controles vem antes da previa no codigo**, e a previa so e desenhada no topo
 * (`order-first`): quem anda pelo Tab chega aos controles primeiro, e nao atravessa o
 * quadro da previa para comecar.
 *
 * **`-top-5`, e nao `top-6`**: o navegador mede o "grudar" a partir de dentro do
 * respiro de cima da area que rola (40 px), e com `top-6` a previa grudava a 64 px do
 * topo, com um vao branco em cima que so sumia no fim da tela. Assim ela gruda a uns
 * 20 px.
 *
 * Como usar: os grupos (`SettingsGroup`) vao em `children`, e a `PreviewSection` vai em
 * `preview` — direto, sem embrulho, porque e o pai dela que gruda e muda de ordem.
 *
 * **No celular e no tablet em pe, com `previewEmFolha`**, a previa sai do topo e abre numa
 * folha de baixo por um botao flutuante, "Ver prévia", preso ao pe da tela. A previa alta
 * no topo empurrava as escolhas para baixo, e quem mudava a cor la embaixo nao via o
 * resultado; presa no alto, ela tirava um terco da tela. Ao lado do botao, a tela pode
 * por uma acao (`acaoNoCelular`): em O botão, o Publicar quando ha mudanca, que no
 * titulo tambem saia da vista.
 */
export function EditorWithPreview({
  preview,
  children,
  className,
  previewEmFolha = false,
  acaoNoCelular,
  tituloDaPrevia = 'Prévia',
  folhaAlta = false,
  larguraDaPrevia,
  previewOpen,
}: {
  /** A previa, na coluna da direita, presa ao rolar. */
  preview: ReactNode
  /** Os controles, na coluna da esquerda, um embaixo do outro. */
  children: ReactNode
  className?: string
  /** No celular, a previa numa folha, pelo botao flutuante. Sem isto, ela fica no topo. */
  previewEmFolha?: boolean
  /** Ao lado do "Ver prévia", no celular: o Publicar da tela, por exemplo. */
  acaoNoCelular?: ReactNode
  /** O titulo da folha: o nome da previa ("Como aparece no card"), que la sai da moldura. */
  tituloDaPrevia?: string
  /**
   * A folha quase da altura da tela, com a previa preenchendo o que sobra: e a do
   * formulario (`PreviewSection`), que com a altura fixa aparecia cortado pela metade e
   * rolava duas vezes, a folha e o formulario.
   */
  folhaAlta?: boolean
  /**
   * A largura que a previa precisa para nao apertar o que mostra: a do formulario de exemplo,
   * com a margem da pagina de mentira em volta. A coluna dela nunca fica mais estreita que
   * isso; e quando nao sobra espaco para os controles ao lado (a janela entre o tablet e o
   * computador, com o menu aberto), a previa vai para a folha, como no tablet. Na coluna de
   * 40%, o formulario chegava a 196 px de largura, com o titulo quebrando em tres linhas.
   */
  larguraDaPrevia?: number
  /**
   * A previa que so aparece as vezes (a Privacidade, so com um texto de depois de enviar
   * aberto). Fechada, os controles ficam com a largura da tela; aberta, a coluna da previa
   * entra pela direita, devagar, com `larguraDaPrevia` de largura, e no celular aparece o
   * "Ver prévia". Sem esta escolha, a previa esta sempre ali, como nas outras telas.
   */
  previewOpen?: boolean
}) {
  const estreita = useMediaQuery('(max-width: 63.99rem)')
  const [folha, setFolha] = useState(false)
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null)
  /** A previa que aparece as vezes, e se agora ela esta aberta. */
  const opcional = previewOpen !== undefined
  const aberta = previewOpen !== false
  useEffect(() => {
    if (!aberta) setFolha(false)
  }, [aberta])
  const caixa = useCaixaDe(raiz)
  const apertada =
    larguraDaPrevia !== undefined &&
    caixa !== null &&
    caixa.largura < larguraDaPrevia + VAO_ENTRE_AS_COLUNAS + LARGURA_MINIMA_DOS_CONTROLES
  const lado = !estreita && !(previewEmFolha && apertada)
  const larguraDoOpcional = larguraDaPrevia ?? LARGURA_DA_PREVIA_OPCIONAL
  const [coluna, setColuna] = useState<HTMLDivElement | null>(null)
  const altura = useAlturaDaPrevia(coluna, lado)
  useParteAcesaAVista(coluna, altura !== null)

  if (previewEmFolha && !lado)
    return (
      <div
        ref={setRaiz}
        className={cn('flex min-w-0 flex-col gap-3', className)}
        {...guideTarget('opcoes')}
      >
        {children}
        {/* Preso ao pe da janela, no meio, acima da barra de gestos do telefone. So o botao
            recebe toque: a faixa em volta deixa passar para o que esta embaixo. */}
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-sticky flex justify-center gap-2 px-4"
          // Com o menu ao lado (a previa larga que nao coube, no computador), no meio dos
          // controles, e nao no meio da janela, por cima do menu.
          style={
            !estreita && caixa
              ? { left: caixa.esquerda, right: 'auto', width: caixa.largura }
              : undefined
          }
        >
          {aberta && (
            <button
              type="button"
              onClick={() => setFolha(true)}
              {...guideTarget('previa')}
              className="pointer-events-auto flex h-11 animate-fade-in items-center gap-2 rounded-full border border-border bg-surface-raised px-4 font-medium text-body text-fg shadow-lg transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none dark:bg-surface-strong"
            >
              <svg
                viewBox="0 0 16 16"
                className="size-4 flex-none"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
                <circle cx="8" cy="8" r="2" />
              </svg>
              Ver prévia
            </button>
          )}
          {acaoNoCelular && (
            <div className="pointer-events-auto flex animate-fade-in items-center rounded-full shadow-lg [&>button]:h-11 [&>button]:rounded-full [&>button]:px-5">
              {acaoNoCelular}
            </div>
          )}
        </div>
        <BottomSheet open={folha} onOpenChange={setFolha} title={tituloDaPrevia} alta={folhaAlta}>
          {/* Na folha, a previa perde a moldura e o titulo dela, que viram os da folha; o
              estado ("ainda não salvo") fica. Todas seguem o mesmo desenho: uma `section`
              com um `header` de titulo e estado. */}
          <div className="flex flex-1 flex-col [&>section>header>h2]:hidden [&>section>header]:justify-start [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0">
            <PreviaNaFolha.Provider value>{preview}</PreviaNaFolha.Provider>
          </div>
        </BottomSheet>
      </div>
    )

  return (
    <div
      ref={setRaiz}
      className={cn(
        // `grid-cols-1` e a coluna unica com minimo zero: sem ela, no celular a coluna
        // crescia ate o quadro de exemplo caber inteiro, e a tela rolava para o lado.
        'grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start',
        // A coluna da previa que aparece as vezes cresce e encolhe devagar, junto do vao.
        opcional &&
          'lg:transition-[grid-template-columns,column-gap] lg:duration-300 lg:ease-out motion-reduce:transition-none',
        className,
      )}
      style={
        lado && opcional
          ? {
              gridTemplateColumns: `minmax(0,1fr) ${aberta ? larguraDoOpcional : 0}px`,
              columnGap: aberta ? VAO_ENTRE_AS_COLUNAS : 0,
            }
          : // A previa que precisa de largura nunca fica mais estreita que ela.
            lado && larguraDaPrevia !== undefined
            ? { gridTemplateColumns: `minmax(0,3fr) minmax(${larguraDaPrevia}px,2fr)` }
            : undefined
      }
    >
      <div
        className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1"
        {...guideTarget('opcoes')}
      >
        {children}
      </div>
      <div
        ref={setColuna}
        className={cn(
          'order-first min-w-0 lg:sticky lg:-top-5 lg:order-none lg:col-start-2 lg:row-start-1',
          // Na altura que sobra da tela: a previa do formulario preenche essa altura (o palco
          // cresce com ela), e a que nao preenche (o caminho do relato, a jornada) fica com a
          // dela e, maior que a coluna, rola por dentro, sem passar da dobra.
          altura !== null && 'flex flex-col overflow-y-auto [scrollbar-width:thin]',
          // Enquanto a coluna cresce, a previa nao se espreme: ela tem a largura dela, e o
          // que ainda nao cabe fica de fora.
          opcional && 'overflow-x-hidden',
        )}
        style={altura !== null ? { height: altura } : undefined}
        {...guideTarget('previa')}
      >
        {opcional ? (
          <div
            inert={!aberta}
            aria-hidden={!aberta || undefined}
            style={{ width: larguraDoOpcional }}
            className={cn(
              'transition-[opacity,translate] duration-300 ease-out motion-reduce:transition-none',
              aberta ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0',
            )}
          >
            {preview}
          </div>
        ) : (
          <PreviaNaAltura.Provider value={altura !== null}>{preview}</PreviaNaAltura.Provider>
        )}
      </div>
    </div>
  )
}

/** O vao entre as duas colunas (`gap-6`). */
const VAO_ENTRE_AS_COLUNAS = 24
/** Mais estreitos que isto, os controles apertam: a previa larga vai para a folha. */
const LARGURA_MINIMA_DOS_CONTROLES = 480
/** A coluna da previa que aparece as vezes, quando a tela nao diz outra. */
const LARGURA_DA_PREVIA_OPCIONAL = 416

/**
 * Onde o elemento comeca e quanto ele tem de largura, medidos antes de desenhar e de novo
 * quando ele muda de tamanho (a janela, o menu que recolhe). Nulo enquanto nao ha medida
 * (largura zero: escondido, ou sem desenho, como nos testes).
 */
function useCaixaDe(elemento: HTMLElement | null): { esquerda: number; largura: number } | null {
  const [caixa, setCaixa] = useState<{ esquerda: number; largura: number } | null>(null)
  useLayoutEffect(() => {
    if (!elemento) return
    const medir = () => {
      const { left, width } = elemento.getBoundingClientRect()
      const largura = Math.round(width)
      const esquerda = Math.round(left)
      setCaixa((antes) =>
        largura <= 0
          ? null
          : antes?.largura === largura && antes.esquerda === esquerda
            ? antes
            : { esquerda, largura },
      )
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [elemento])
  return caixa
}

/** A coluna da previa nunca fica mais baixa que isto: abaixo, o formulario de exemplo nao cabe. */
const ALTURA_MINIMA_DA_PREVIA = 400
/** O respiro entre o pe da previa e o pe da janela. */
const FOLGA_DE_BAIXO = 16

/**
 * A altura que a previa tem para caber inteira na tela, **de onde ela esta agora ate o pe da
 * janela**. Com a pagina no topo, ela comeca abaixo do titulo, e o pe dela (a area de anexar,
 * o Enviar, o botao no canto) ja esta a vista. Rolando, ela sobe ate grudar no alto e cresce
 * junto, com o pe parado: a altura que o titulo ocupava vira previa, em vez de um vao
 * embaixo. Perto do fim dos controles, ela volta a altura do topo junto com eles. Medida ao
 * abrir, ao rolar, quando a janela muda e quando o que vem antes dela muda de altura (um aviso
 * que aparece, um grupo que abre). Nula abaixo de `lg`, onde a previa e outra.
 */
function useAlturaDaPrevia(coluna: HTMLDivElement | null, ligada: boolean): number | null {
  const [altura, setAltura] = useState<number | null>(null)
  useLayoutEffect(() => {
    const grade = coluna?.parentElement
    if (!ligada || !coluna || !grade) {
      setAltura(null)
      return
    }
    let rola: HTMLElement | null = grade.parentElement
    while (rola && !/(auto|scroll)/.test(getComputedStyle(rola).overflowY))
      rola = rola.parentElement
    const medir = () => {
      const pe = window.innerHeight - FOLGA_DE_BAIXO
      const gradeTopo = grade.getBoundingClientRect().top
      // Com a pagina no topo: abaixo do titulo ate o pe da janela. Menos que isso, nunca.
      const noTopo = pe - (gradeTopo + (rola ? rola.scrollTop : window.scrollY))
      // Onde ela gruda: o navegador conta o `top` da coluna a partir de dentro do respiro de
      // cima da area que rola (ver `-top-5`).
      const caixa = rola?.getBoundingClientRect().top ?? 0
      const respiro = rola ? Number.parseFloat(getComputedStyle(rola).paddingTop) || 0 : 0
      const grudada = caixa + respiro + (Number.parseFloat(getComputedStyle(coluna).top) || 0)
      // A grade, e nao a coluna: no fim da pagina, a grade empurra a coluna grudada para cima,
      // e medir pela coluna a faria crescer atras dela, sem parar.
      const topo = Math.max(gradeTopo, grudada)
      // Cresce ate o pe da janela, mas nao alem do fim dos controles: mais alta que eles, a
      // grade a empurraria para cima no fim da pagina, e o titulo da previa sumiria.
      const controles = coluna.previousElementSibling?.getBoundingClientRect().bottom ?? pe
      const rolando = Math.min(pe, controles) - topo
      setAltura(Math.round(Math.max(ALTURA_MINIMA_DA_PREVIA, noTopo, rolando)))
    }
    // Uma medida por quadro ao rolar: a altura acompanha a rolagem, sem pular.
    let quadro = 0
    const aoRolar = () => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(medir)
    }
    medir()
    const alvo: HTMLElement | Window = rola ?? window
    alvo.addEventListener('scroll', aoRolar, { passive: true })
    window.addEventListener('resize', medir)
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir)
    if (grade.parentElement) observador?.observe(grade.parentElement)
    return () => {
      cancelAnimationFrame(quadro)
      alvo.removeEventListener('scroll', aoRolar)
      window.removeEventListener('resize', medir)
      observador?.disconnect()
    }
  }, [coluna, ligada])
  return altura
}

/**
 * A parte acesa da previa (o passo do caminho do relato, o aviso da Privacidade) fora da
 * vista da coluna entra nela, devagar: a coluna rola por dentro so o que precisa. A previa
 * do formulario cuida da dela, la dentro do quadro (`EmbedApp`).
 */
function useParteAcesaAVista(coluna: HTMLDivElement | null, ligada: boolean) {
  useEffect(() => {
    if (!ligada || !coluna) return
    const devagar = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let quadro = 0
    const trazer = () => {
      const parte = coluna.querySelector<HTMLElement>('[data-highlighted]')
      if (!parte) return
      const fora = coluna.getBoundingClientRect()
      const dentro = parte.getBoundingClientRect()
      const folga = 12
      const acima = dentro.top - (fora.top + folga)
      const abaixo = dentro.bottom - (fora.bottom - folga)
      const cabe = dentro.height <= fora.height - 2 * folga
      const delta = acima < 0 || !cabe ? acima : abaixo > 0 ? abaixo : 0
      if (Math.abs(delta) < 1) return
      const destino = coluna.scrollTop + delta
      if (typeof coluna.scrollTo === 'function')
        coluna.scrollTo({ top: destino, behavior: devagar ? 'smooth' : 'auto' })
      else coluna.scrollTop = destino
    }
    const aoMudar = () => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(trazer)
    }
    const observador = new MutationObserver(aoMudar)
    observador.observe(coluna, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-highlighted'],
    })
    aoMudar()
    return () => {
      observador.disconnect()
      cancelAnimationFrame(quadro)
    }
  }, [coluna, ligada])
}
