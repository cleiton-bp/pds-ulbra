import { useId } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * O erro troca o **texto de ajuda** que ja estava ali, em vez de acrescentar
 * linha: o mesmo paragrafo explica o campo e explica o problema, sem a tela pular
 * de altura. `aria-describedby` amarra os dois ao campo.
 */
interface TextFieldProps {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Texto de apoio, substituido pelo erro quando houver. */
  hint?: string
  error?: string | null
  maxLength?: number
  autoFocus?: boolean
  disabled?: boolean
  onSubmit?: () => void
  className?: string
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  maxLength,
  autoFocus,
  disabled,
  onSubmit,
  className,
}: TextFieldProps) {
  const fieldId = useId()
  const messageId = `${fieldId}-message`

  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block text-detail text-fg-muted">
          {label}
        </label>
      )}

      <input
        id={fieldId}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) onSubmit()
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        // biome-ignore lint/a11y/noAutofocus: campo unico de um dialogo que a pessoa acabou de abrir de proposito
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          'h-9 w-full rounded-lg border bg-surface-raised px-3 text-fg text-body',
          'placeholder:text-fg-placeholder disabled:opacity-60',
          error ? 'border-error-border' : 'border-border',
        )}
      />

      {(error || hint) && (
        <p
          id={messageId}
          className={cn(
            'mt-2 text-detail leading-normal',
            error ? 'text-error-fg' : 'text-fg-muted',
          )}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  )
}
