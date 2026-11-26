import { createContext, type ReactNode, useContext } from 'react'
import type { PublicMediaSettingsViewModel, WidgetSettingsViewModel } from '@/contracts'
import { Button } from '@/shared/components/Button'
import {
  type PreviewDevice,
  type PreviewHighlight,
  WidgetPreview,
} from '@/shared/components/WidgetPreview'
import { cn } from '@/shared/lib/cn'

/**
 * A previa ao vivo, numa secao: o titulo, a etiqueta que diz se ha o que publicar e
 * uma frase do que olhar nela. **A mesma em toda tela que muda o que se ve** — O
 * botão, Tipos de relato, Formulário e Anexos —, para quem aprendeu a usar uma nao ter
 * de aprender a outra.
 *
 * A etiqueta fala a lingua do botao do titulo: "ainda não publicado", e nao "não
 * salvo" — a tela tem Publicar, e nao Salvar.
 */
/**
 * A previa esta dentro da folha do celular (ver `EditorWithPreview`): la a folha ja tem o
 * titulo e a moldura, e a secao fica so com o estado, a frase e a previa.
 */
export const PreviaNaFolha = createContext(false)

/**
 * A previa na coluna da direita do computador, ajustada a altura que sobra da tela
 * (`EditorWithPreview`): a secao e o palco ocupam essa altura, e nada passa da dobra. Com o
 * palco de altura fixa, numa tela mais baixa o pe do formulario (a area de anexar, o
 * Enviar) ficava abaixo da dobra, e a pessoa tinha de rolar a pagina para ver.
 */
export const PreviaNaAltura = createContext(false)

/**
 * A largura que a previa do formulario precisa ao lado dos controles (`EditorWithPreview`,
 * `larguraDaPrevia`): o formulario no minimo dele (360), a margem de 20 da pagina de mentira
 * dos dois lados e a moldura da secao. Mais estreita, o formulario de exemplo apertava, e o
 * titulo, o estado e as abas nao cabiam numa linha.
 */
export const LARGURA_DA_PREVIA_DO_FORMULARIO = 434

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
  /**
   * O que olhar nesta previa, em uma frase curta, que caiba numa linha. Que nada enviado
   * daqui chega ao Trabalho, o proprio formulario diz a quem tenta enviar.
   */
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
  const naFolha = useContext(PreviaNaFolha)
  const naAltura = useContext(PreviaNaAltura)
  const estado = dirty ? 'ainda não publicado' : 'igual ao seu sistema'

  if (naFolha)
    return (
      <section id={id} aria-label="Prévia" className="flex flex-1 flex-col">
        <p className="mb-1 font-medium text-caption text-fg-muted">{estado}</p>
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">{hint}</p>
        <WidgetPreview
          settings={settings}
          media={media}
          device={device}
          onDeviceChange={onDeviceChange}
          note={note}
          highlight={highlight}
          startOpen={startOpen}
          preencher
        />
      </section>
    )

  // No computador, o titulo, o estado e as abas do aparelho dividem uma linha, e a frase
  // vem curta embaixo: em tres linhas e com a moldura larga, o cabecalho comia 170 px, e o
  // formulario de exemplo ficava com a metade da altura dele.
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-6 rounded-xl border border-border bg-surface-raised p-4',
        naAltura && 'flex min-h-0 flex-1 flex-col',
      )}
    >
      <WidgetPreview
        settings={settings}
        media={media}
        device={device}
        onDeviceChange={onDeviceChange}
        note={note}
        highlight={highlight}
        startOpen={startOpen}
        ajustada={naAltura}
        cabecalho={
          <header className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="font-semibold text-fg text-lead">Prévia</h2>
            <span className="text-caption text-fg-muted">{estado}</span>
          </header>
        }
        dica={hint}
      />
    </section>
  )
}

/**
 * O lugar da previa quando o que esta publicado nao chegou. **A previa sempre parte do
 * publicado**: no lugar dele, a configuracao de fabrica aparecia como se fosse a do
 * sistema da pessoa, com o selo "igual ao seu sistema".
 */
export function PreviewUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <section aria-label="Prévia" className="rounded-xl border border-border bg-surface-raised p-5">
      <h2 className="mb-1 font-semibold text-fg text-lead">Prévia</h2>
      <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
        Não deu para ler o que está publicado agora, então a prévia fica de fora.
      </p>
      <Button size="sm" onClick={onRetry}>
        Tentar de novo
      </Button>
    </section>
  )
}
