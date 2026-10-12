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
import { launcherMode, placeFrame, readResize } from '@/embed/launcher'
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

/** A largura que o quadro recebe como a da janela: so ela decide se e celular. */
const LARGURA = { computer: 1280, phone: 375 } as const

/** Em que aparelho a previa mostra o botao. */
export type PreviewDevice = keyof typeof LARGURA

/**
 * O que a previa realca do assunto em que a pessoa esta. **No botao**, desenhado pelo
 * painel: as guias da distancia (`distance`), com a Posição aberta, ou o contorno do
 * botao (`button`), com o foco na Aparência. **No formulario aberto**, desenhado pelo
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
 * **Mesma origem, e so ela.** O quadro em previa so ouve a janela de cima da propria
 * origem, e o painel so ouve o seu `iframe`, da origem dele. Se um dia a ferramenta for
 * servida de outro endereco, a previa ao vivo nao funciona — e a tela diz isso, em vez
 * de mostrar um quadro vazio.
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
}: {
  settings: WidgetSettingsViewModel
  /** Os anexos do rascunho, na tela de Anexos. Sem eles, o formulario sai sem a area de anexar. */
  media?: PublicMediaSettingsViewModel | null
  /**
   * O aparelho, quando a tela decide — O botão troca para o celular ao abrir "No
   * celular". Sem ele, a previa guarda a escolha sozinha.
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
}) {
  const origemDaFerramenta = new URL(environment.embedUrl).origin
  const mesmaOrigem = typeof window !== 'undefined' && origemDaFerramenta === window.location.origin

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
    if (!mesmaOrigem) return

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
  }, [mesmaOrigem, origemDaFerramenta])

  const largura = LARGURA[aparelho]
  larguraDaRegra.current = largura

  // O botao, montado uma vez na pagina de mentira — pelo mesmo modulo do carregador.
  useEffect(() => {
    const elemento = area.current
    if (!mesmaOrigem || !elemento) return

    const vista = createLauncherView({
      parent: elemento,
      placement: 'absolute',
      viewport: () => ({ width: elemento.clientWidth, height: elemento.clientHeight }),
      ruleWidth: () => larguraDaRegra.current,
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
  }, [mesmaOrigem])

  // O rascunho muda o botao na hora, como a configuracao publicada muda o do site.
  useEffect(() => {
    botao.current?.setAppearance(settings)
  }, [settings])

  // A pagina de mentira mudou de tamanho, ou de aparelho: o botao e conferido de novo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o tamanho e o aparelho sao o gatilho
  useEffect(() => {
    botao.current?.refresh()
  }, [tamanho, largura])

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

  // O rascunho vai a cada mudanca, e de novo quando o quadro avisa que (re)carregou.
  useEffect(() => {
    if (!pronto) return

    const mensagem: PreviewMessage = {
      source: MESSAGE_SOURCE,
      type: 'preview',
      settings,
      viewport: { width: largura, height: tamanho.height },
      media,
      highlight: realceDoFormulario,
    }
    quadro.current?.contentWindow?.postMessage(mensagem, origemDaFerramenta)
  }, [pronto, settings, media, realceDoFormulario, largura, tamanho.height, origemDaFerramenta])

  if (!mesmaOrigem) {
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
  const lugar = pedido ? placeFrame(pedido, tamanho) : null
  const px = (valor: number | null) => (valor === null ? undefined : `${valor}px`)

  const posicao: CSSProperties = lugar
    ? {
        width: lugar.width,
        height: lugar.height,
        top: px(lugar.top),
        bottom: px(lugar.bottom),
        left: px(lugar.left),
        right: px(lugar.right),
        borderRadius: lugar.radius,
        // So aberto: fechado, quem aparece e o botao.
        visibility: aberto ? 'visible' : 'hidden',
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
    <div>
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
                  'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-detail transition-colors',
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
          No celular, o botão não aparece — é o que está escolhido em “No celular”.
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
          'relative h-[30rem] overflow-hidden rounded-lg border border-border bg-surface',
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
