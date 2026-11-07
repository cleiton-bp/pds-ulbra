import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import type { PublicMediaSettingsViewModel, WidgetSettingsViewModel } from '@/contracts'
import { environment } from '@/data'
import { frameMotion, prefersReducedMotion } from '@/embed/frameMotion'
import { frameRadius, launcherMode, placeFrame, readResize } from '@/embed/launcher'
import {
  isOurMessage,
  isPreviewFormPart,
  MESSAGE_SOURCE,
  type OpenMessage,
  type PreviewFormPart,
  type PreviewMessage,
  type ResizeMessage,
} from '@/embed/protocol'
import { createLauncherView, type LauncherView } from '@/loader/launcherView'
import { cn } from '@/shared/lib/cn'
import { useThemeStore } from '@/shared/lib/themeStore'

/** A largura que o quadro recebe como a da janela: so ela decide se e celular. */
const LARGURA = { computer: 1280, phone: 375 } as const

/**
 * O tema do painel onde a previa esta: o `color-scheme` dali, que e o que o `iframe` do
 * formulario receberia do navegador. Sem um esquema claro ou escuro definido, o do
 * sistema. O botao e o formulario da previa usam este valor no lugar do `Auto`.
 */
function temaDoPainel(elemento: Element): 'light' | 'dark' {
  const esquema = getComputedStyle(elemento).colorScheme ?? ''
  const claro = esquema.includes('light')
  const escuro = esquema.includes('dark')
  if (escuro && !claro) return 'dark'
  if (claro && !escuro) return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Em que aparelho a previa mostra o botao. */
export type PreviewDevice = keyof typeof LARGURA

/**
 * O que a previa realca do assunto em que a pessoa esta. **No botao**, desenhado pelo
 * painel: as guias da distancia (`distance`), com a Posição aberta, ou o contorno do
 * botao (`button`), com a Aparência aberta. **No formulario aberto**, desenhado pelo
 * proprio quadro: uma das partes de `PREVIEW_FORM_PARTS` (`form-top`, `form-type`,
 * `form-title`, `form-box`, `form-attachments`, `form-name`, `form-submit`), contornada
 * — Formulário realca o grupo aberto, Anexos a area de anexar.
 */
export type PreviewHighlight = 'distance' | 'button' | PreviewFormPart

const APARELHOS: ReadonlyArray<{ value: PreviewDevice; label: string }> = [
  { value: 'computer', label: 'Computador' },
  { value: 'phone', label: 'Celular' },
]

/** Onde o botao esta desenhado, dentro da pagina de mentira. */
interface Retangulo {
  left: number
  top: number
  width: number
  height: number
}

/**
 * A previa e a **ferramenta de verdade**, com o que ainda nao foi publicado, numa
 * pagina de mentira.
 *
 * **O quadro e o mesmo `embed.html` do site do cliente**, aberto em modo de previa: o
 * painel manda o rascunho por `postMessage` a cada mudanca, e o quadro se desenha com
 * ele. O painel faz o papel do carregador — **desenha o botao com o mesmo codigo dele**
 * (`loader/launcherView`), recebe os `resize` e posiciona o `iframe` com a mesma conta
 * (`placeFrame`). Nao ha segunda implementacao do botao nem do formulario para
 * envelhecer sozinha.
 *
 * **So o painel fala com o quadro.** O quadro em previa so ouve a janela de cima da
 * propria origem ou da origem do painel que o build conhece (`environment.panelOrigin`),
 * e o painel so ouve o seu `iframe`, da origem dele. Em producao os dois moram em
 * enderecos diferentes (o painel na raiz, o quadro na CDN), e era isso que deixava as
 * quatro previas so com um aviso: o quadro, que so aceitava a propria origem, ignorava
 * o painel. Sem a origem do painel no build e em enderecos diferentes, a previa ao vivo
 * nao funciona, e a tela diz isso, em vez de mostrar um quadro vazio.
 *
 * **Nada e enviado daqui.** O botao de enviar so avisa; o relato de teste continua em
 * Instalacao.
 *
 * **Mora em `shared`, e nao numa tela**: O botão, Tipos de relato, Textos do
 * formulário e Anexos mostram a mesma previa, cada uma com o rascunho dela por cima do
 * que esta publicado.
 */
export function WidgetPreview({
  settings,
  media = null,
  device,
  onDeviceChange,
  note,
  highlight = null,
  startOpen = false,
  preencher = false,
}: {
  settings: WidgetSettingsViewModel
  /** Os anexos do rascunho, na tela de Anexos. Sem eles, o formulario sai sem a area de anexar. */
  media?: PublicMediaSettingsViewModel | null
  /**
   * O aparelho, quando a tela guarda a escolha (O botão, para ela valer na previa da folha
   * do celular tambem). Sem ele, a previa guarda a escolha sozinha.
   */
  device?: PreviewDevice
  /** A pessoa escolheu o aparelho na previa. */
  onDeviceChange?: (device: PreviewDevice) => void
  /** Um selo ao lado das abas, como "Mostrando: celular" quando a tela trocou sozinha. */
  note?: ReactNode
  /** O que realcar no botao ou no formulario aberto. Ver `PreviewHighlight`. */
  highlight?: PreviewHighlight | null
  /**
   * Abre o formulario ao carregar, sem clique — a tela Formulário mostra o formulario,
   * e nao o botao. Abre **sem pegar o foco**: a pessoa continua onde estava na tela.
   */
  startOpen?: boolean
  /**
   * A pagina de mentira preenche a altura que o pai da, em vez dos 480 fixos (nunca menos
   * de 26rem): e a da folha alta do celular, onde o formulario inteiro cabe sem rolar duas
   * vezes.
   */
  preencher?: boolean
}) {
  const origemDaFerramenta = new URL(environment.embedUrl).origin
  const aquiMesmo = typeof window !== 'undefined' ? window.location.origin : null
  // Ao vivo quando o quadro aceita este painel: os dois no mesmo endereco (o
  // desenvolvimento), ou o painel declarado no build, que e o mesmo do quadro (producao:
  // o painel na raiz, o quadro na CDN). Ver `connectToPreviewPanel`.
  const aoVivo =
    aquiMesmo !== null &&
    (origemDaFerramenta === aquiMesmo || environment.panelOrigin === aquiMesmo)
  // O tema do painel, para o botao e o formulario da previa o acompanharem quando ele troca.
  const temaEscolhido = useThemeStore((estado) => estado.theme)

  // **Sempre abre em Computador**, e quem troca para Celular e a pessoa, nas abas. Ja abriu
  // em Celular nas telas estreitas, e quem chegava nao sabia em que aparelho estava olhando.
  const [aparelhoProprio, setAparelhoProprio] = useState<PreviewDevice>('computer')
  const aparelho = device ?? aparelhoProprio
  const setAparelho = (escolhido: PreviewDevice) => {
    setAparelhoProprio(escolhido)
    onDeviceChange?.(escolhido)
  }
  const area = useRef<HTMLDivElement>(null)
  const quadro = useRef<HTMLIFrameElement>(null)
  const [tamanho, setTamanho] = useState({ width: 0, height: 0 })
  /** Muda a cada `preview-ready`: o quadro (re)carregou e precisa do rascunho. */
  const [pronto, setPronto] = useState(0)
  const [pedido, setPedido] = useState<ResizeMessage | null>(null)
  /** O formulario esta aberto — pelo botao, como no site, ou ja ao carregar. */
  const [aberto, setAberto] = useState(startOpen)
  /** A abertura de agora foi a do carregar, e nao um clique: nao leva o foco. */
  const abriuSozinho = useRef(startOpen)
  const [retangulo, setRetangulo] = useState<Retangulo | null>(null)
  const ids = useId()
  /** O botao, desenhado pelo codigo do carregador dentro da pagina de mentira. */
  const botao = useRef<LauncherView | null>(null)
  /** A abertura de agora ja foi avisada ao quadro — avisar de novo roubaria o foco. */
  const avisado = useRef(false)
  /** Fechou pelo quadro: o foco volta ao botao, como no site. */
  const fechou = useRef(false)
  const larguraDaRegra = useRef<number>(LARGURA.computer)

  // O tamanho da pagina de mentira, que muda com a janela do painel e com o aparelho.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o aparelho troca a largura da area, e e o gatilho de medir de novo
  useEffect(() => {
    const elemento = area.current
    if (!elemento) return

    const medir = () => setTamanho({ width: elemento.clientWidth, height: elemento.clientHeight })
    medir()

    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [aparelho])

  // As mensagens do quadro: so do nosso `iframe`, so da origem dele, so as nossas.
  useEffect(() => {
    if (!aoVivo) return

    function ouvir(event: MessageEvent) {
      if (event.origin !== origemDaFerramenta) return
      if (event.source !== quadro.current?.contentWindow) return
      if (!isOurMessage(event.data)) return

      if (event.data.type === 'preview-ready') {
        setPronto((atual) => atual + 1)
        return
      }

      if (event.data.type === 'close') {
        fechou.current = true
        setAberto(false)
        return
      }

      const lido = readResize(event.data)
      if (lido) setPedido(lido)
    }

    window.addEventListener('message', ouvir)
    return () => window.removeEventListener('message', ouvir)
  }, [aoVivo, origemDaFerramenta])

  const largura = LARGURA[aparelho]
  larguraDaRegra.current = largura

  // O botao, montado uma vez na pagina de mentira — pelo mesmo modulo do carregador.
  useEffect(() => {
    const elemento = area.current
    if (!aoVivo || !elemento) return

    const vista = createLauncherView({
      parent: elemento,
      placement: 'absolute',
      viewport: () => ({ width: elemento.clientWidth, height: elemento.clientHeight }),
      ruleWidth: () => larguraDaRegra.current,
      // O `Auto` segue o tema do painel, o mesmo que o formulario recebe dentro do
      // `iframe` (o navegador passa o `color-scheme` da pagina para ele): botao e
      // formulario da previa no mesmo tema, e nao o botao pelo sistema e o resto pelo
      // painel.
      autoTheme: () => temaDoPainel(elemento),
      onOpen: () => {
        abriuSozinho.current = false
        setAberto(true)
      },
      onCancel: () => setAberto(false),
    })
    botao.current = vista
    return () => {
      vista.destroy()
      botao.current = null
    }
  }, [aoVivo])

  // O rascunho muda o botao na hora, como a configuracao publicada muda o do site.
  useEffect(() => {
    botao.current?.setAppearance(settings)
  }, [settings])

  // A pagina de mentira mudou de tamanho, ou de aparelho, ou o painel trocou de tema: o
  // botao e conferido de novo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o tamanho, o aparelho e o tema sao o gatilho
  useEffect(() => {
    botao.current?.refresh()
  }, [tamanho, largura, temaEscolhido])

  // Aberto: o botao some e o quadro aparece — ou a tela de "abrindo", se ele ainda nao
  // respondeu. Fechado: o botao volta, e com o foco se foi o quadro que fechou.
  useEffect(() => {
    const vista = botao.current
    if (!vista) return

    if (!aberto) {
      avisado.current = false
      vista.show('button')
      if (fechou.current) vista.focusButton()
      fechou.current = false
      return
    }

    if (!pedido) {
      vista.show('loading')
      return
    }

    vista.show('hidden')
    if (avisado.current) return
    avisado.current = true
    const comFoco = !abriuSozinho.current
    abriuSozinho.current = false
    if (comFoco) quadro.current?.focus()
    const mensagem: OpenMessage = { source: MESSAGE_SOURCE, type: 'open', focus: comFoco }
    quadro.current?.contentWindow?.postMessage(mensagem, origemDaFerramenta)
  }, [aberto, pedido, origemDaFerramenta])

  // O realce do botao e do painel; o do formulario vai ao quadro, que se contorna.
  const realceDoBotao = highlight === 'distance' || highlight === 'button' ? highlight : null
  const realceDoFormulario = isPreviewFormPart(highlight) ? highlight : null

  // O realce mede o botao desenhado, depois de ele se desenhar: as guias saem do lugar
  // dele de verdade, e nao de uma conta paralela que envelheceria.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a aparencia, o tamanho, o aparelho e a abertura mudam o lugar do botao, e sao o gatilho de medir
  useEffect(() => {
    const elemento = area.current
    if (!realceDoBotao || !elemento || aberto) {
      setRetangulo(null)
      return
    }
    const quadroDeMedir = requestAnimationFrame(() => {
      const desenho = elemento.querySelector<HTMLElement>('[data-pds-launcher]')
      const caixa = desenho?.getBoundingClientRect()
      if (!desenho || !caixa || desenho.style.display === 'none' || caixa.width === 0) {
        setRetangulo(null)
        return
      }
      const fora = elemento.getBoundingClientRect()
      setRetangulo({
        left: caixa.left - fora.left,
        top: caixa.top - fora.top,
        width: caixa.width,
        height: caixa.height,
      })
    })
    return () => cancelAnimationFrame(quadroDeMedir)
  }, [realceDoBotao, settings, tamanho, largura, aberto])

  // O rascunho vai a cada mudanca, e de novo quando o quadro avisa que (re)carregou, ou
  // quando o painel troca de tema.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o tema escolhido e o gatilho de mandar de novo; o valor e lido do painel
  useEffect(() => {
    if (!pronto) return

    const mensagem: PreviewMessage = {
      source: MESSAGE_SOURCE,
      type: 'preview',
      settings,
      viewport: { width: largura, height: tamanho.height },
      media,
      highlight: realceDoFormulario,
      // O `Auto` do formulario segue o tema do painel, como o botao desenhado aqui.
      theme: temaDoPainel(area.current ?? document.documentElement),
    }
    quadro.current?.contentWindow?.postMessage(mensagem, origemDaFerramenta)
  }, [
    pronto,
    settings,
    media,
    realceDoFormulario,
    largura,
    tamanho.height,
    origemDaFerramenta,
    temaEscolhido,
  ])

  if (!aoVivo) {
    return (
      <p className="text-detail text-fg-muted">
        A prévia ao vivo precisa que o painel e a ferramenta sejam servidos do mesmo endereço, e
        neste ambiente eles não são. O relato de teste, em Instalação, continua mostrando a
        ferramenta publicada.
      </p>
    )
  }

  // Escondido no celular: quem decide e o botao, com a mesma regra do site.
  const escondido = launcherMode(settings, null, largura) === 'hidden'
  // A largura da regra, e nao a medida: a pagina de mentira do computador tem menos de
  // 640 px aqui no painel, e sem isto a previa mostraria a folha do celular.
  const lugar = pedido ? placeFrame(pedido, { ...tamanho, ruleWidth: largura }) : null
  const px = (valor: number | null) => (valor === null ? undefined : `${valor}px`)

  // A abertura escolhida, com a conta do carregador: abrir e fechar como no site. Fechado,
  // o quadro some pelo caminho de volta e so fica invisivel no fim (o `visibility`
  // espera o movimento), sem receber clique enquanto some.
  const passo = frameMotion(
    settings.OpenAnimation,
    settings.OpenAnimationSpeed,
    settings.Position,
    prefersReducedMotion(),
    lugar?.sheet ?? false,
  )
  const transicao = aberto
    ? passo.openTransition
    : passo.closeMs
      ? `${passo.closeTransition}, visibility 0s linear ${passo.closeMs}ms`
      : ''

  const posicao: CSSProperties = lugar
    ? {
        width: lugar.width,
        height: lugar.height,
        top: px(lugar.top),
        bottom: px(lugar.bottom),
        left: px(lugar.left),
        right: px(lugar.right),
        borderRadius: frameRadius(lugar),
        // So aberto: fechado, quem aparece e o botao.
        visibility: aberto ? 'visible' : 'hidden',
        opacity: aberto ? 1 : Number(passo.hidden.opacity),
        transform: aberto ? 'none' : passo.hidden.transform,
        transformOrigin: passo.origin,
        transition: transicao,
        pointerEvents: aberto ? undefined : 'none',
      }
    : // Ate o primeiro `resize`, invisivel — como o carregador faz no site.
      { visibility: 'hidden', width: 360, height: 520, right: 20, bottom: 20 }

  // As abas andam pelas setas, como abas: uma parada de Tab, e a seta troca.
  function aoTeclarNasAbas(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const proximo = aparelho === 'computer' ? 'phone' : 'computer'
    const destino = event.key === 'Home' ? 'computer' : event.key === 'End' ? 'phone' : proximo
    setAparelho(destino)
    document.getElementById(`${ids}-${destino}`)?.focus()
  }

  return (
    <div className={cn(preencher && 'flex flex-1 flex-col')}>
      {/* Abas, e nao escolhas de configuracao: trocar o aparelho so muda o que se ve
          aqui, e nao grava nada. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Aparelho da prévia"
          onKeyDown={aoTeclarNasAbas}
          className="inline-flex rounded-lg border border-border bg-surface p-0.5"
        >
          {APARELHOS.map(({ value, label }) => {
            const escolhido = aparelho === value
            return (
              <button
                key={value}
                id={`${ids}-${value}`}
                type="button"
                role="tab"
                aria-selected={escolhido}
                aria-controls={`${ids}-pagina`}
                tabIndex={escolhido ? 0 : -1}
                onClick={() => setAparelho(value)}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-detail transition-colors pointer-coarse:h-10 pointer-coarse:px-3',
                  escolhido
                    ? 'bg-surface-sunken font-medium text-fg'
                    : 'text-fg-muted hover:text-fg',
                )}
              >
                <DesenhoDoAparelho device={value} />
                {label}
              </button>
            )
          })}
        </div>
        {note && (
          <span className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-caption text-fg-muted">
            {note}
          </span>
        )}
      </div>

      {escondido && (
        <p className="mb-3 text-detail text-fg-muted">
          No celular, o botão não aparece, porque é o que está escolhido em “No celular”.
        </p>
      )}
      {!settings.IsEnabled && (
        <p className="mb-3 text-detail text-fg-muted">
          A ferramenta está desligada: no seu sistema, o botão não aparece. A prévia mostra como ele
          ficaria ligado.
        </p>
      )}

      <div
        ref={area}
        id={`${ids}-pagina`}
        role="tabpanel"
        aria-labelledby={`${ids}-${aparelho}`}
        className={cn(
          'relative overflow-hidden rounded-lg border border-border bg-surface',
          preencher ? 'min-h-[26rem] flex-1' : 'h-[30rem]',
          aparelho === 'phone' ? 'mx-auto w-full max-w-[23.4375rem]' : 'w-full',
        )}
      >
        {/* A pagina de mentira: um cabecalho e algumas linhas, para o botao ter onde ficar. */}
        <div className="flex flex-col gap-2.5 p-4" aria-hidden="true">
          <div className="mb-2 flex items-center justify-between">
            <div className="h-3 w-24 rounded bg-surface-strong" />
            <div className="h-2 w-1/3 rounded bg-surface-sunken" />
          </div>
          <div className="h-4 w-1/2 rounded bg-surface-strong" />
          <div className="h-2 w-4/5 rounded bg-surface-sunken" />
          <div className="h-2 w-3/5 rounded bg-surface-sunken" />
          <div className="h-2 w-2/3 rounded bg-surface-sunken" />
          <div className="mt-3 h-24 w-full rounded-md bg-surface-sunken" />
        </div>

        <iframe
          ref={quadro}
          title="Prévia da ferramenta"
          src={`${environment.embedUrl}?preview`}
          style={{ position: 'absolute', border: 0, ...posicao }}
          className={cn(
            lugar?.shadow === 'open' && 'shadow-lg',
            lugar?.shadow === 'launcher' && 'shadow-md',
          )}
        />

        {retangulo && realceDoBotao === 'button' && <Contorno retangulo={retangulo} />}
        {retangulo && realceDoBotao === 'distance' && (
          <Guias retangulo={retangulo} area={tamanho} settings={settings} />
        )}
      </div>
    </div>
  )
}

/** O contorno tracejado em volta do botao: "e isto que voce esta mudando". */
function Contorno({ retangulo }: { retangulo: Retangulo }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute rounded-xl border-2 border-accent border-dashed"
      style={{
        left: retangulo.left - 5,
        top: retangulo.top - 5,
        width: retangulo.width + 10,
        height: retangulo.height + 10,
      }}
    />
  )
}

/**
 * As guias da distancia: uma linha tracejada de cada borda do canto ate o botao, com
 * o numero. E o que "20 px da borda" quer dizer, desenhado.
 */
function Guias({
  retangulo,
  area,
  settings,
}: {
  retangulo: Retangulo
  area: { width: number; height: number }
  settings: WidgetSettingsViewModel
}) {
  const esquerda = settings.Position === 'TopLeft' || settings.Position === 'BottomLeft'
  const emCima = settings.Position === 'TopLeft' || settings.Position === 'TopRight'
  const meioY = retangulo.top + retangulo.height / 2
  const meioX = retangulo.left + retangulo.width / 2
  const inicioX = esquerda ? 0 : retangulo.left + retangulo.width
  const larguraX = esquerda ? retangulo.left : area.width - inicioX
  const inicioY = emCima ? 0 : retangulo.top + retangulo.height
  const alturaY = emCima ? retangulo.top : area.height - inicioY

  return (
    <span aria-hidden className="pointer-events-none">
      <span
        className="absolute border-fg-muted border-t border-dashed"
        style={{ left: inicioX, top: meioY, width: larguraX }}
      />
      <span
        className="absolute rounded bg-surface-raised px-1 text-caption text-fg"
        style={{ left: inicioX + larguraX / 2 - 16, top: meioY - 22 }}
      >
        {settings.OffsetX} px
      </span>
      <span
        className="absolute border-fg-muted border-l border-dashed"
        style={{ left: meioX, top: inicioY, height: alturaY }}
      />
      <span
        className="absolute rounded bg-surface-raised px-1 text-caption text-fg"
        style={{ left: meioX + 6, top: inicioY + alturaY / 2 - 9 }}
      >
        {settings.OffsetY} px
      </span>
    </span>
  )
}

/** O desenho de cada aba: a tela do computador e o celular. */
function DesenhoDoAparelho({ device }: { device: PreviewDevice }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {device === 'computer' ? (
        <>
          <rect x="1.5" y="2.5" width="13" height="8.5" rx="1" />
          <path d="M5.5 14h5M8 11v3" />
        </>
      ) : (
        <>
          <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
          <path d="M7.5 12.5h1" />
        </>
      )}
    </svg>
  )
}
