import {
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ImageEditorProps } from '@/editor/ImageEditor'
import type { AttachmentDraft } from '@/embed/useAttachmentDraft'
import { cn } from '@/shared/lib/cn'

type EditorModule = typeof import('@/editor/ImageEditor')

let carregando: Promise<EditorModule> | null = null

/**
 * Baixa o editor, **uma vez, e so quando alguem o abre**. O quadro carrega em toda
 * visita ao site do cliente, e quase ninguem marca um print: o editor nao pesa em
 * quem so passa. O que falha e esquecido, para a proxima abertura tentar de novo —
 * ha navegador que guarda a falha do modulo ate recarregar, e ai tentar de novo nao
 * adianta; e por isso que a falha sempre deixa a pessoa decidir o que fazer.
 */
export function loadImageEditor(): Promise<EditorModule> {
  carregando ??= import('@/editor/ImageEditor')
  carregando.catch(() => {
    carregando = null
  })
  return carregando
}

/** Quanto o editor pode levar para chegar antes de a tela oferecer as saidas. */
export const EDITOR_LOAD_TIMEOUT_MS = 20_000

/**
 * O editor da imagem que o rascunho pediu — `editar`, `editarCaptura` — ou nada.
 *
 * **A colagem la dentro para aqui.** O editor abre por cima de tudo, mas os eventos
 * do React sobem pela arvore dos componentes, e nao pela pagina: posto dentro do
 * formulario — que cola em qualquer lugar —, colar no texto de uma marca anexaria
 * outra imagem na lista atras. Segurar aqui vale onde quer que o editor seja posto.
 *
 * **Fechado, o foco volta a quem o abriu** — o "Editar" da miniatura. A captura nao
 * tem quem a abriu com foco (o botao estava desligado enquanto a pessoa marcava a
 * area), e ai quem monta a tela diz para onde ele vai.
 *
 * @param accent As cores do cliente, no quadro.
 * @param onOpenChange Quando o editor abre e fecha. No quadro e o que pede a pagina
 *   um tamanho maior: 360 por 520 pixels nao sao lugar para marcar um print.
 * @param focusAfterCapture Para onde vai o foco quando fecha o editor de uma captura.
 */
export function AttachmentEditor({
  draft,
  accent,
  onOpenChange,
  focusAfterCapture,
}: {
  draft: AttachmentDraft
  accent?: CSSProperties
  onOpenChange?: (open: boolean) => void
  focusAfterCapture?: () => void
}) {
  const pedido = draft.edicao
  const aberto = pedido !== null
  const [Editor, setEditor] = useState<ComponentType<ImageEditorProps> | null>(null)

  // Quem tinha o foco ao abrir. Em efeito de layout: roda antes de o veu ou o editor
  // puxarem o foco para si.
  const abridor = useRef<HTMLElement | null>(null)
  const eraCaptura = useRef(false)
  useLayoutEffect(() => {
    if (!aberto) return
    const ativo = document.activeElement
    abridor.current = ativo instanceof HTMLElement && ativo !== document.body ? ativo : null
  }, [aberto])
  if (pedido) eraCaptura.current = pedido.target === null

  // So na mudanca: montar a tela com o editor fechado nao e fechar o editor.
  const antes = useRef(aberto)
  useEffect(() => {
    if (antes.current !== aberto) {
      onOpenChange?.(aberto)
      if (!aberto) {
        const alvo = abridor.current
        abridor.current = null
        if (alvo?.isConnected) alvo.focus()
        else if (eraCaptura.current) focusAfterCapture?.()
      }
    }
    antes.current = aberto
  }, [aberto, onOpenChange, focusAfterCapture])

  if (!pedido) return null

  return (
    // `contents`: nao ocupa lugar no formulario. So segura a colagem.
    <div className="contents" onPaste={(evento) => evento.stopPropagation()}>
      {Editor ? (
        <Editor
          key={pedido.id}
          source={pedido.source}
          initial={pedido.doc}
          mode={pedido.target === null ? 'add' : 'save'}
          maxBytes={pedido.maxBytes}
          accent={accent}
          onDone={(resultado) => void draft.concluirEdicao(resultado)}
          onCancel={draft.cancelarEdicao}
        />
      ) : (
        <EditorChegando
          key={pedido.id}
          accent={accent}
          captura={pedido.target === null}
          onLoaded={(componente) => setEditor(() => componente)}
          onAddWithoutMarks={() => void draft.concluirEdicao({ file: pedido.source, doc: null })}
          onCancel={draft.cancelarEdicao}
        />
      )}
    </div>
  )
}

/**
 * O lugar do editor enquanto ele chega. **Cobre tudo e prende o foco**, como o editor
 * vai prender: no quadro ja ampliado, o formulario atras ficaria esticado e clicavel.
 *
 * **Sempre tem saida.** Uma rede parada nao avisa quando desistir: passado o prazo, ou
 * na falha, a pessoa escolhe — tentar de novo, e, na captura, adicionar sem marcas ou
 * descartar. **A captura nunca entra sozinha**: quem contava em cobrir a senha no
 * editor nao pode descobrir depois que ela foi sem tarja.
 */
function EditorChegando({
  accent,
  captura,
  onLoaded,
  onAddWithoutMarks,
  onCancel,
}: {
  accent?: CSSProperties
  captura: boolean
  onLoaded: (editor: ComponentType<ImageEditorProps>) => void
  onAddWithoutMarks: () => void
  onCancel: () => void
}) {
  const [falhou, setFalhou] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const caixa = useRef<HTMLDivElement>(null)
  const idSituacao = useId()

  // **O foco nao sai daqui**, de onde quer que tente sair — do Tab, do leitor de tela,
  // ou de quem monta a tela devolvendo o foco a um botao que esta atras.
  useEffect(() => {
    function prenderFoco(evento: FocusEvent) {
      const lugar = caixa.current
      if (lugar && evento.target instanceof Node && !lugar.contains(evento.target)) lugar.focus()
    }
    document.addEventListener('focusin', prenderFoco)
    caixa.current?.focus()
    return () => document.removeEventListener('focusin', prenderFoco)
  }, [])

  // Quem avisa muda de identidade a cada desenho; o que vale e o de agora.
  const avisar = useRef(onLoaded)
  avisar.current = onLoaded

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativa` e o gatilho de tentar de novo.
  useEffect(() => {
    let vivo = true
    setFalhou(false)
    const prazo = setTimeout(() => {
      if (vivo) setFalhou(true)
    }, EDITOR_LOAD_TIMEOUT_MS)

    // Chegando depois do prazo, o editor ainda abre: a pessoa nao escolheu nada ainda.
    loadImageEditor()
      .then((modulo) => {
        if (vivo) avisar.current(modulo.ImageEditor)
      })
      .catch(() => {
        if (vivo) setFalhou(true)
      })
      .finally(() => clearTimeout(prazo))

    return () => {
      vivo = false
      clearTimeout(prazo)
    }
  }, [tentativa])

  // Enquanto chega, o foco fica no proprio lugar — e nao em "Descartar", onde um Enter
  // jogaria a captura fora. Na falha, vai para "Tentar de novo".
  useEffect(() => {
    if (falhou) caixa.current?.querySelector('button')?.focus()
  }, [falhou])

  function prender(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      onCancel()
      return
    }
    if (evento.key !== 'Tab') return

    const botoes = Array.from(evento.currentTarget.querySelectorAll('button'))
    if (botoes.length === 0) return
    evento.preventDefault()
    const agora = botoes.indexOf(document.activeElement as HTMLButtonElement)
    const proximo = evento.shiftKey
      ? agora <= 0
        ? botoes.length - 1
        : agora - 1
      : (agora + 1) % botoes.length
    botoes[proximo]?.focus()
  }

  const botao = 'inline-flex h-8 items-center justify-center rounded-lg border px-3 text-detail'
  const secundario = cn(botao, 'border-border bg-surface text-fg enabled:hover:bg-surface-sunken')

  return (
    <div
      ref={caixa}
      role="dialog"
      aria-modal="true"
      aria-labelledby={idSituacao}
      tabIndex={-1}
      style={accent}
      onKeyDown={prender}
      className="fixed inset-0 z-dialog flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center"
    >
      <p
        id={idSituacao}
        role="status"
        className="max-w-xs text-detail text-fg-muted leading-normal"
      >
        {falhou ? 'O editor não abriu. Confira a conexão e tente de novo.' : 'Abrindo o editor…'}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {falhou && (
          <button
            type="button"
            onClick={() => setTentativa((n) => n + 1)}
            // Opacidade no hover, e nao outro fundo: a cor do cliente sumiria sob o ponteiro.
            className={cn(
              botao,
              'border-transparent font-medium enabled:hover:opacity-90',
              'bg-[var(--widget-accent,var(--accent))] text-[var(--widget-ink,var(--accent-fg))]',
            )}
          >
            Tentar de novo
          </button>
        )}
        {falhou && captura && (
          <button type="button" onClick={onAddWithoutMarks} className={secundario}>
            Adicionar sem marcas
          </button>
        )}
        <button type="button" onClick={onCancel} className={secundario}>
          {captura ? 'Descartar' : 'Cancelar'}
        </button>
      </div>
    </div>
  )
}
