import { type ReactNode, useRef } from 'react'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import type { Anexo } from '@/embed/attachments'
import { acceptAttribute } from '@/embed/attachments'
import { cn } from '@/shared/lib/cn'
import { formatBytes } from '@/shared/lib/formatBytes'

/** A classe dos botoes de anexar. Exportada para os botoes extras ficarem iguais. */
export const ATTACH_BUTTON_CLASS = cn(
  'h-8 rounded-lg border border-border bg-surface px-3 text-detail text-fg',
  'enabled:hover:bg-surface-sunken disabled:cursor-not-allowed disabled:text-fg-disabled',
)

/**
 * Escolher arquivos antes de enviar: o botao, as miniaturas e a recusa.
 *
 * **Nao sobe nada.** E so a lista local — quem envia e quem monta a tela, depois de
 * o texto existir do lado de la.
 *
 * **Os botoes extras entram por fora** (`actions`), porque capturar e gravar
 * existem no quadro e nao na pagina de acompanhamento. O seletor e o mesmo nos
 * dois lugares, e e isso que este componente garante.
 */
export function AttachmentPicker({
  media,
  anexos,
  recusa,
  onAdd,
  onRemove,
  actions,
  status,
  busy = false,
}: {
  media: PublicMediaSettingsViewModel
  anexos: Anexo[]
  recusa: string | null
  onAdd: (arquivos: File[]) => void
  onRemove: (id: string) => void
  /** Botoes a mais, ao lado de "Anexar arquivo". */
  actions?: ReactNode
  /** O que aparece embaixo dos botoes enquanto algo acontece, como uma gravacao. */
  status?: ReactNode
  /** Algo em curso: esconde a dica de colar, que so atrapalharia. */
  busy?: boolean
}) {
  const seletor = useRef<HTMLInputElement>(null)
  const cheio = anexos.length >= media.MaxFilesPerReport

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={() => seletor.current?.click()}
          disabled={cheio}
          className={ATTACH_BUTTON_CLASS}
        >
          Anexar arquivo
        </button>

        {actions}

        {!busy && <span className="text-caption text-fg-muted">ou cole um print aqui</span>}
      </div>

      {status}

      {/* Escondido, e aberto pelo botao: o seletor nativo nao aceita a cor do
          cliente nem cabe em 360 pixels com o nome do arquivo ao lado. O `accept`
          ja faz o navegador esconder o que nao serve. */}
      <input
        ref={seletor}
        type="file"
        multiple
        accept={acceptAttribute(media)}
        aria-label="Escolher arquivo para anexar"
        className="hidden"
        onChange={(event) => {
          const arquivos = Array.from(event.target.files ?? [])
          // Zera para o mesmo arquivo poder ser escolhido de novo depois de removido.
          event.target.value = ''
          onAdd(arquivos)
        }}
      />

      {anexos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {anexos.map((anexo) => (
            <li
              key={anexo.id}
              className="relative h-14 w-14 overflow-hidden rounded-lg border border-border bg-surface-sunken"
              title={`${anexo.file.name} — ${formatBytes(anexo.file.size)}`}
            >
              {anexo.preview ? (
                <img
                  src={anexo.preview}
                  alt={anexo.file.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-caption text-fg-muted">
                  {anexo.kind === 'Video' ? 'vídeo' : 'imagem'}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(anexo.id)}
                aria-label={`Remover ${anexo.file.name}`}
                className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface/90 text-caption text-fg"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {recusa && (
        <p role="alert" className="text-caption text-error-fg leading-normal">
          {recusa}
        </p>
      )}
    </div>
  )
}

/**
 * Os arquivos depois de enviar o texto: na fila, subindo, enviado ou com falha.
 *
 * **A frase da falha diz primeiro que o texto esta salvo.** E o que a pessoa precisa
 * saber quando um arquivo nao vai: que nao perdeu o que escreveu.
 *
 * @param savedNote O que foi salvo, dito do jeito da tela — "o relato", "a resposta".
 */
export function AttachmentProgress({
  anexos,
  onRetry,
  savedNote,
}: {
  anexos: Anexo[]
  onRetry: (anexo: Anexo) => void
  savedNote: string
}) {
  if (anexos.length === 0) return null

  const falha = anexos.find((anexo) => anexo.status === 'failed')

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <p className="mb-2 text-detail text-fg-muted">Arquivos</p>
      <ul className="flex flex-col gap-1.5">
        {anexos.map((anexo) => (
          <li key={anexo.id} className="flex items-center justify-between gap-3 text-detail">
            <span className="min-w-0 truncate text-fg">{anexo.file.name}</span>
            <span className="flex-none text-fg-muted">
              {anexo.status === 'waiting' && 'na fila'}
              {anexo.status === 'sending' && `${Math.round(anexo.progress * 100)}%`}
              {anexo.status === 'done' && 'enviado'}
              {anexo.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => onRetry(anexo)}
                  className="font-medium text-fg underline underline-offset-4"
                >
                  Tentar de novo
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {falha && (
        <p className="mt-2 text-caption text-fg-muted leading-normal">
          {savedNote} Só o arquivo não foi junto — {falha.error ?? 'tente de novo.'}
        </p>
      )}
    </div>
  )
}
