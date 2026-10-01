import type { CaptureModule } from '@/capture/area'
import {
  type CaptureDoneMessage,
  type CaptureRequestMessage,
  MESSAGE_SOURCE,
} from '@/embed/protocol'
import type { AreaPicker } from '@/loader/areaPicker'

/**
 * Quanto a imagem pode levar para ficar pronta. Uma pagina enorme num celular fraco
 * leva segundos; mais que isto, algo parou — e a pessoa nao pode ficar debaixo do
 * veu esperando.
 */
export const CAPTURE_TIMEOUT_MS = 30_000

/** O que a captura precisa da pagina. Por fora, para dar para testar sem ela. */
export interface CaptureFlowDeps {
  /** O estilo do nosso `iframe`: a captura o esconde e o devolve. */
  frameStyle: CSSStyleDeclaration
  /** Devolve o foco ao quadro, onde a pessoa estava. */
  focusFrame: () => void
  openPicker: () => AreaPicker
  /** Baixa o arquivo da captura — so na primeira vez. */
  loadModule: () => Promise<CaptureModule>
  reply: (message: CaptureDoneMessage) => void
  /** O prazo da imagem. Ver `CAPTURE_TIMEOUT_MS`. */
  timeoutMs?: number
}

type Desfecho = { outcome: CaptureDoneMessage['outcome']; file: File | null }

/** Uma promessa que nunca termina: o lado de uma corrida que nao pode ganhar. */
const NUNCA = new Promise<never>(() => {})

/**
 * A captura pedida pelo quadro, do comeco ao fim.
 *
 * **O quadro some enquanto a pessoa marca.** Ele fica no canto da pagina, e e
 * justamente o que ela nao quer no print — alem de estar por cima do que quer.
 *
 * **O arquivo da captura baixa enquanto a pessoa marca**, e nao depois: marcar leva
 * segundos, e e o tempo de ele chegar. **Se ele nao chega, a camada fecha na hora**
 * (`'unavailable'`): o que o bloqueia — a pagina que proibe o nosso script, o
 * servidor fora — nao muda na proxima area, e pedir para marcar de novo seria
 * fazer a pessoa trabalhar para ouvir a mesma recusa.
 *
 * **Sempre ha resposta, o quadro sempre volta, e o foco com ele.** Desistir, falhar,
 * estourar o prazo ou dar certo, o quadro reaparece e ouve como terminou — sem isto,
 * uma falha no meio deixaria o quadro escondido e o botao dele esperando para
 * sempre. E quem usa teclado volta para onde estava, e nao para o comeco da pagina
 * do cliente.
 */
export function createCaptureHandler(deps: CaptureFlowDeps) {
  let capturando = false
  const prazo = deps.timeoutMs ?? CAPTURE_TIMEOUT_MS

  async function capture(request: CaptureRequestMessage): Promise<void> {
    const responder = ({ outcome, file }: Desfecho) =>
      deps.reply({ source: MESSAGE_SOURCE, type: 'capture-done', id: request.id, outcome, file })

    // Um pedido de cada vez. O segundo, com o primeiro no meio, e dado por
    // desistido — quem pediu nao fica esperando.
    if (capturando) {
      responder({ outcome: 'cancel', file: null })
      return
    }

    capturando = true
    const visibilidade = deps.frameStyle.visibility
    deps.frameStyle.visibility = 'hidden'

    const modulo = deps.loadModule()
    // Nao baixou: a corrida abaixo decide o que fazer; aqui so nao e erro solto.
    const naoBaixou = modulo.then(
      () => NUNCA,
      () => 'unavailable' as const,
    )

    let picker: AreaPicker | null = null

    try {
      try {
        picker = deps.openPicker()
      } catch {
        // A pagina nao deixa nem montar a camada: nao vai deixar da proxima vez.
        responder({ outcome: 'unavailable', file: null })
        return
      }

      const escolha = await Promise.race([picker.chosen, naoBaixou])

      if (escolha === 'unavailable') {
        responder({ outcome: 'unavailable', file: null })
        return
      }

      if (!escolha) {
        responder({ outcome: 'cancel', file: null })
        return
      }

      picker.busy()

      const gerar = async (): Promise<Desfecho> => {
        let pronto: CaptureModule
        try {
          pronto = await modulo
        } catch {
          return { outcome: 'unavailable', file: null }
        }
        return { outcome: 'file', file: await pronto.capturePage(escolha, request.maxBytes) }
      }

      let relogio: ReturnType<typeof setTimeout> | undefined

      try {
        responder(
          await Promise.race([
            gerar(),
            picker.aborted.then((): Desfecho => ({ outcome: 'cancel', file: null })),
            new Promise<Desfecho>((resolve) => {
              relogio = setTimeout(() => resolve({ outcome: 'failed', file: null }), prazo)
            }),
          ]),
        )
      } finally {
        clearTimeout(relogio)
      }
    } catch {
      responder({ outcome: 'failed', file: null })
    } finally {
      picker?.close()
      deps.frameStyle.visibility = visibilidade
      deps.focusFrame()
      capturando = false
    }
  }

  return Object.assign(capture, {
    /**
     * Ha uma captura em curso. Quem redimensiona o quadro pergunta antes de o
     * mostrar: girar o telefone no meio nao pode traze-lo de volta para baixo do veu.
     */
    isCapturing: () => capturando,
  })
}
