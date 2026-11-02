import { useId } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * O erro troca o **texto de ajuda** que ja estava ali, em vez de acrescentar
 * linha: o mesmo paragrafo explica o campo e explica o problema, sem a tela pular
 * de altura. `aria-describedby` amarra os dois ao campo.
 */
interface TextFieldProps {
  /** O `id` do campo, quando alguem precisa apontar para ele (`tela#campo`). */
  id?: string
  label?: string
  /**
   * Nome do campo para quem nao ve o rotulo — leitor de tela e teste. Existe
   * porque nem todo campo tem `label` visivel: o do nome do projeto e o de
   * endereco moram debaixo de um `h2` que ja diz o que eles sao, e repetir a
   * palavra na tela seria ruido. Sem isto, o campo se anuncia como "caixa de
   * texto", sem mais nada.
   */
  ariaLabel?: string
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
  /**
   * O teclado que o celular abre: `email` no convite, `url` no dominio. O campo comum
   * abria o de texto, com a primeira letra maiuscula e o corretor mexendo no endereco.
   */
  type?: 'text' | 'email' | 'url'
}

export function TextField({
  id,
  label,
  ariaLabel,
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
  type = 'text',
}: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const messageId = `${fieldId}-message`

  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block font-medium text-detail text-fg">
          {label}
        </label>
      )}

      <input
        id={fieldId}
        type="text"
        // So o teclado muda (`inputMode`): o `type` de e-mail ou de endereco faria o navegador
        // recusar "loja.exemplo.com" sem o https. Endereco e e-mail nao tem maiuscula nem
        // corretor, e o celular trocava "loja" por "Loja".
        {...(type === 'text'
          ? {}
          : {
              inputMode: type,
              autoComplete: type === 'email' ? 'email' : 'off',
              autoCapitalize: 'none',
              autoCorrect: 'off',
              spellCheck: false,
            })}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) onSubmit()
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={label ? undefined : ariaLabel}
        // biome-ignore lint/a11y/noAutofocus: campo unico de um dialogo que a pessoa acabou de abrir de proposito
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          'h-9 w-full rounded-lg border bg-surface-raised px-3 text-fg text-body transition-colors duration-150',
          'placeholder:text-fg-placeholder disabled:opacity-60',
          error ? 'border-error-border' : 'border-border-control',
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
