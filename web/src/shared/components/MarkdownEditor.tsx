import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { Markdown } from '@/shared/components/Markdown'
import { cn } from '@/shared/lib/cn'
import { applyFormat, type FormatAction } from '@/shared/lib/markdownEditing'

/**
 * Onde o time escreve a descricao de um card: o texto em Markdown, uma barra que
 * escreve a marcacao, e a aba "Visualizar".
 *
 * **A barra escreve a marcacao, e nao a esconde.** Quem nunca viu Markdown aprende
 * vendo o `**` aparecer em volta do que selecionou; quem conhece digita direto. Os
 * atalhos de sempre valem: Ctrl ou ⌘ com B, I e K.
 *
 * **"Visualizar" mostra exatamente o que o card vai mostrar** — o mesmo componente
 * desenha os dois. Uma previa que desenha diferente do card seria uma promessa
 * que o card nao cumpre.
 */
export function MarkdownEditor({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  disabled,
  rows = 6,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  maxLength?: number
  placeholder?: string
  disabled?: boolean
  rows?: number
}) {
  const fieldId = useId()
  const [previewing, setPreviewing] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)

  // A selecao que a barra calculou, aplicada depois que o texto novo chega ao campo.
  // Antes disso o campo ainda tem o texto velho, e a selecao cairia no lugar errado.
  const pendingSelection = useRef<[number, number] | null>(null)

  useLayoutEffect(() => {
    const selection = pendingSelection.current
    if (selection && textarea.current) {
      textarea.current.focus()
      textarea.current.setSelectionRange(selection[0], selection[1])
      pendingSelection.current = null
    }
  })

  function format(action: FormatAction) {
    const field = textarea.current
    if (!field || disabled) return

    const next = applyFormat(
      { value, selectionStart: field.selectionStart, selectionEnd: field.selectionEnd },
      action,
    )

    // O teto vale para a barra tambem: a marcacao nao pode empurrar o texto para alem
    // do que a API aceita.
    if (maxLength !== undefined && next.value.length > maxLength) return

    pendingSelection.current = [next.selectionStart, next.selectionEnd]
    onChange(next.value)
  }

  const nearLimit = maxLength !== undefined && value.length > maxLength * 0.8

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={fieldId} className="text-detail text-fg-muted">
          {label}
        </label>

        <fieldset className="flex gap-1" aria-label="Modo da descrição">
          <ModeButton active={!previewing} onClick={() => setPreviewing(false)}>
            Escrever
          </ModeButton>
          <ModeButton active={previewing} onClick={() => setPreviewing(true)}>
            Visualizar
          </ModeButton>
        </fieldset>
      </div>

      {previewing ? (
        <section
          className="min-h-24 rounded-lg border border-border bg-surface px-3 py-2"
          aria-label="Prévia da descrição"
        >
          {value.trim().length > 0 ? (
            <Markdown source={value} />
          ) : (
            <p className="text-detail text-fg-muted">Nada para visualizar ainda.</p>
          )}
        </section>
      ) : (
        <div className="rounded-lg border border-border bg-surface focus-within:border-fg-muted">
          <div
            className="flex flex-wrap gap-0.5 border-border border-b px-1.5 py-1"
            role="toolbar"
            aria-label="Formatação"
          >
            <ToolButton label="Negrito (Ctrl+B)" onClick={() => format('bold')} disabled={disabled}>
              <span className="font-bold">B</span>
            </ToolButton>
            <ToolButton
              label="Itálico (Ctrl+I)"
              onClick={() => format('italic')}
              disabled={disabled}
            >
              <span className="font-serif italic">I</span>
            </ToolButton>
            <ToolButton label="Código" onClick={() => format('code')} disabled={disabled}>
              <span className="font-mono">{'</>'}</span>
            </ToolButton>
            <ToolButton label="Link (Ctrl+K)" onClick={() => format('link')} disabled={disabled}>
              Link
            </ToolButton>
            <ToolButton label="Lista" onClick={() => format('bulleted')} disabled={disabled}>
              • Lista
            </ToolButton>
            <ToolButton
              label="Lista numerada"
              onClick={() => format('numbered')}
              disabled={disabled}
            >
              1. Lista
            </ToolButton>
          </div>

          <textarea
            id={fieldId}
            ref={textarea}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (!(event.ctrlKey || event.metaKey) || event.altKey) return
              const key = event.key.toLowerCase()
              const action: FormatAction | null =
                key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'k' ? 'link' : null
              if (action) {
                event.preventDefault()
                format(action)
              }
            }}
            maxLength={maxLength}
            disabled={disabled}
            rows={rows}
            placeholder={placeholder}
            className="block w-full resize-y rounded-b-lg bg-transparent px-3 py-2 text-body text-fg leading-relaxed placeholder:text-fg-placeholder focus:outline-none disabled:opacity-60"
          />
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-caption text-fg-muted">
        <span>
          Aceita Markdown: <code className="font-mono">**negrito**</code>,{' '}
          <code className="font-mono">*itálico*</code>, <code className="font-mono">- lista</code>,{' '}
          <code className="font-mono">[link](https://…)</code>.
        </span>
        {nearLimit && (
          <span className="tabular-nums">
            {value.length} de {maxLength}
          </span>
        )}
      </div>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-7 rounded-md px-2.5 text-caption transition-colors',
        active ? 'bg-surface-sunken font-medium text-fg' : 'text-fg-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      // O clique na barra nao pode tirar o foco do campo antes da hora: a selecao
      // que a barra vai ler e a que esta no campo.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="h-7 min-w-7 rounded-md px-1.5 text-caption text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg disabled:opacity-50"
    >
      {children}
    </button>
  )
}
