import * as Primitive from '@radix-ui/react-select'
import { useId } from 'react'
import { cn } from '@/shared/lib/cn'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  label?: string
  /** Nome para quem nao ve o rotulo, como no `TextField`. */
  ariaLabel?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Texto de apoio, substituido pelo erro quando houver. */
  hint?: string
  error?: string | null
  disabled?: boolean
  size?: 'md' | 'sm'
  className?: string
}

/**
 * A caixa de escolha da aplicacao.
 *
 * **A lista aberta e desenhada por nos, e e por isso que ela existe.** Um
 * `select` do navegador aceita estilo no campo fechado e **nao** na lista que
 * abre: aquela e desenhada pelo sistema operacional, e nenhum CSS a alcanca. O
 * resultado era um campo com a cara do produto que virava outra coisa no clique.
 *
 * O preco e conhecido e aceito: a lista do navegador vem de graca com teclado,
 * leitor de tela e a roda nativa do celular. Por isso a base e o `Select` do
 * Radix — a mesma casa do dialogo, do menu e da dica deste projeto —, que
 * devolve essas tres coisas numa lista que a gente estiliza.
 *
 * A moldura e a mesma do `DropdownMenu`, de proposito: sobreposicao do produto
 * tem uma forma so.
 */
export function Select({
  label,
  ariaLabel,
  value,
  onChange,
  options,
  hint,
  error,
  disabled,
  size = 'md',
  className,
}: SelectProps) {
  const fieldId = useId()
  const messageId = `${fieldId}-message`

  // O Radix trata string vazia como "nada escolhido" e nao deixa usa-la como
  // valor. Aqui ela e uma escolha de verdade — "o padrao", "sem coluna" —, entao
  // vai e volta por um marcador que nunca colide com um GUID.
  const VAZIO = '__vazio__'
  const escolhido = options.find((option) => option.value === value)

  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block text-detail text-fg-muted">
          {label}
        </label>
      )}

      <Primitive.Root
        value={value === '' ? VAZIO : value}
        onValueChange={(novo) => onChange(novo === VAZIO ? '' : novo)}
        disabled={disabled}
      >
        <Primitive.Trigger
          id={fieldId}
          aria-label={label ? undefined : ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-lg border bg-surface-raised text-left text-fg',
            'disabled:cursor-not-allowed disabled:opacity-60',
            size === 'md' ? 'h-9 px-3 text-body' : 'h-8 px-2.5 text-detail',
            error ? 'border-error-border' : 'border-border',
          )}
        >
          {/* O texto trunca em vez de esticar o campo: nome de coluna longo numa
              linha de lista empurraria os botoes para fora da tela. */}
          <span className="min-w-0 truncate">{escolhido?.label ?? ''}</span>

          <Primitive.Icon asChild>
            <svg
              viewBox="0 0 12 12"
              className="size-3 flex-none text-fg-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 4.8 6 7.8l3-3" />
            </svg>
          </Primitive.Icon>
        </Primitive.Trigger>

        <Primitive.Portal>
          <Primitive.Content
            position="popper"
            sideOffset={4}
            className={cn(
              'z-dialog overflow-hidden rounded-xl border border-border bg-surface-raised',
              // A lista acompanha a largura do campo. Sem isto ela sai mais estreita
              // e desalinhada, e a escolha passa a parecer um menu solto por cima da
              // tela em vez da continuacao daquele campo.
              'min-w-[var(--radix-select-trigger-width)]',
              // Mesma elevacao do aviso: sombra no claro, e nada no escuro, onde as
              // superficies ja se separam pela cor.
              'shadow-lg dark:shadow-none',
            )}
          >
            <Primitive.Viewport className="max-h-64 p-1">
              {options.map((option) => (
                <Primitive.Item
                  key={option.value}
                  value={option.value === '' ? VAZIO : option.value}
                  disabled={option.disabled}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-lg outline-none',
                    'data-[highlighted]:bg-surface-sunken data-[disabled]:opacity-50',
                    size === 'md'
                      ? 'px-2.5 py-1.5 text-body text-fg'
                      : 'px-2 py-1 text-detail text-fg',
                  )}
                >
                  <Primitive.ItemText>{option.label}</Primitive.ItemText>

                  {/* O visto diz qual esta escolhido. O fundo cinza sozinho e
                      ambiguo: ele marca onde o teclado esta, e nao a escolha. */}
                  <Primitive.ItemIndicator asChild>
                    <svg
                      viewBox="0 0 12 12"
                      className="size-3 flex-none text-fg-muted"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M2.5 6.3 4.8 8.6 9.5 3.9" />
                    </svg>
                  </Primitive.ItemIndicator>
                </Primitive.Item>
              ))}
            </Primitive.Viewport>
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>

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
