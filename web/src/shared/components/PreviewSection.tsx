import type { ReactNode } from 'react'
import type { PublicMediaSettingsViewModel, WidgetSettingsViewModel } from '@/contracts'
import {
  type PreviewDevice,
  type PreviewHighlight,
  WidgetPreview,
} from '@/shared/components/WidgetPreview'

/**
 * A previa ao vivo, numa secao: o titulo, a etiqueta que diz se ha o que publicar e
 * uma frase do que olhar nela. **A mesma em toda tela que muda o que se ve** — O
 * botão, Tipos de relato, Formulário e Anexos —, para quem aprendeu a usar uma nao ter
 * de aprender a outra.
 *
 * A etiqueta fala a lingua do botao do titulo: "ainda não publicado", e nao "não
 * salvo" — a tela tem Publicar, e nao Salvar.
 */
export function PreviewSection({
  id = 'previa',
  settings,
  media,
  dirty,
  hint,
  device,
  onDeviceChange,
  note,
  highlight,
  startOpen,
}: {
  id?: string
  settings: WidgetSettingsViewModel
  media?: PublicMediaSettingsViewModel | null
  /** Ha mudanca por salvar: a previa mostra algo que o site ainda nao mostra. */
  dirty: boolean
  /** O que olhar nesta previa, em uma frase. */
  hint: ReactNode
  /** O aparelho, quando a tela decide. Ver `WidgetPreview`. */
  device?: PreviewDevice
  onDeviceChange?: (device: PreviewDevice) => void
  /** O selo ao lado das abas do aparelho. Ver `WidgetPreview`. */
  note?: ReactNode
  /**
   * O que realcar: no botao, ou uma parte do formulario aberto (`form-title`,
   * `form-attachments`…). Ver `PreviewHighlight`.
   */
  highlight?: PreviewHighlight | null
  /** Abre o formulario ao carregar. Ver `WidgetPreview`. */
  startOpen?: boolean
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-border bg-surface-raised p-5">
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-fg text-lead">Prévia</h2>
        <span className="flex-none text-caption text-fg-muted">
          {dirty ? 'ainda não publicado' : 'igual ao seu sistema'}
        </span>
      </header>
      <p className="mb-4 text-detail text-fg-muted leading-relaxed">
        {hint} Nada enviado daqui chega ao Trabalho.
      </p>
      <WidgetPreview
        settings={settings}
        media={media}
        device={device}
        onDeviceChange={onDeviceChange}
        note={note}
        highlight={highlight}
        startOpen={startOpen}
      />
    </section>
  )
}
