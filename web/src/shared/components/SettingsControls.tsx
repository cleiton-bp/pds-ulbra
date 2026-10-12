import { type KeyboardEvent, type ReactNode, useId } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * As pecas das telas de configuracao da ferramenta: O botão, Formulário e a
 * previa. Moram em `shared` porque mais de uma tela as usa — e uma secao desenhada
 * de dois jeitos em telas vizinhas e o tipo de diferenca que ninguem pediu.
 */

export function Section({
  id,
  title,
  description,
  children,
  className,
}: {
  /** A ancora da secao: a busca da configuracao leva ate ela. */
  id?: string
  title: string
  /** Uma linha logo abaixo do titulo: o que se resolve nesta secao. */
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      className={cn('scroll-mt-6 rounded-xl border border-border bg-surface-raised p-5', className)}
    >
      <h2 className={cn('font-semibold text-fg text-lead', description ? 'mb-1' : 'mb-3.5')}>
        {title}
      </h2>
      {description && (
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">{description}</p>
      )}
      {children}
    </section>
  )
}

export function Field({
  id,
  label,
  className,
  children,
}: {
  /** A ancora do campo: a busca leva ate ele, e o foco cai na primeira escolha. */
  id?: string
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className={cn('scroll-mt-6', className)}>
      {/* `div` e nao `label`: o controle aqui dentro e um grupo de botoes, e
          rotulo que aponta para nada confunde leitor de tela. O nome do grupo vai
          no `aria-label` dele. */}
      <div className="mb-1.5 text-detail text-fg-muted">{label}</div>
      {children}
    </div>
  )
}

/**
 * Um grupo de escolhas exclusivas, em pilulas de texto. E um `radiogroup` de verdade:
 * uma parada de Tab so, e as setas andam e escolhem — sete escolhas eram sete paradas.
 */
export function Options<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  /** O nome do grupo — o mesmo do `Field` em volta, que e so texto. */
  label: string
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
}) {
  return (
    <RadioGroup<T> label={label} value={value} onChange={onChange} options={options} look="pill" />
  )
}

/** Uma escolha do `RadioGroup`. */
export interface RadioOption<T extends string> {
  value: T
  /** O nome: o texto embaixo do desenho, e o que o leitor de tela anuncia. */
  label: string
  /** O desenho da peca. Sem ele, so o nome. */
  drawing?: ReactNode
  /** Uma linha pequena embaixo do nome, como "(já é só o ícone)". */
  note?: ReactNode
  disabled?: boolean
  /** O nome so para o leitor de tela e a dica: a peca mostra so o desenho. */
  hideLabel?: boolean
  /** Onde a peca fica no desenho do grupo (o canto, na tela de mentira). */
  className?: string
}

/**
 * **O grupo de escolhas do painel: radios de verdade, com as setas.** Cada peca e um
 * `<input type="radio">` do mesmo `name`, sem a aparencia nativa, deitado por cima da
 * peca inteira: o navegador da a parada de Tab unica, as setas que andam e escolhem e
 * o anel de foco de sempre — sete escolhas eram sete paradas de Tab.
 *
 * Duas aparencias: `pill`, o texto em pilula (a marcada cheia de acento), e `tile`, a
 * peca com o desenho e o nome embaixo — **a marcada com anel e um visto, e nao com o
 * fundo de acento**: na tela do botao, o acento cheio se confundia com a cor do botao.
 *
 * `move` troca as setas em linha pelas do desenho — o canto do botao anda para cima e
 * para baixo, e nao so para os lados.
 */
export function RadioGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  look = 'tile',
  move,
  className,
}: {
  /** O nome do grupo, para o leitor de tela. */
  label: string
  /** A escolha marcada. Nula, nenhuma. */
  value: T | null
  onChange: (value: T) => void
  options: ReadonlyArray<RadioOption<T>>
  look?: 'pill' | 'tile'
  /** Para onde a seta leva a partir de uma escolha. Sem ele, em linha, pelo navegador. */
  move?: (from: T, key: string) => T | undefined
  className?: string
}) {
  const name = useId()

  function aoTeclar(event: KeyboardEvent<HTMLDivElement>) {
    if (!move) return
    const atual = (event.target as HTMLInputElement).value as T
    const destino = move(atual, event.key)
    const alvo = options.find((option) => option.value === destino)
    if (destino === undefined || !alvo || alvo.disabled) return

    event.preventDefault()
    if (destino !== value) onChange(destino)
    for (const radio of event.currentTarget.querySelectorAll<HTMLInputElement>('input')) {
      if (radio.value === destino) radio.focus()
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={aoTeclar}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {options.map((option) => (
        <RadioItem
          key={option.value}
          name={name}
          option={option}
          checked={option.value === value}
          look={look}
          onSelect={() => onChange(option.value)}
          className={option.className}
        />
      ))}
    </div>
  )
}

/** Uma escolha do grupo: a peca desenhada, com o radio por cima dela inteira. */
function RadioItem<T extends string>({
  name,
  option,
  checked,
  look,
  onSelect,
  className,
}: {
  name: string
  option: RadioOption<T>
  checked: boolean
  look: 'pill' | 'tile'
  onSelect: () => void
  className?: string
}) {
  return (
    <label
      className={cn(
        'relative',
        look === 'pill'
          ? cn(
              'flex h-8 items-center rounded-lg border px-3 text-detail transition-colors',
              checked
                ? 'border-transparent bg-accent font-medium text-accent-fg'
                : 'border-border bg-surface text-fg hover:bg-surface-sunken',
            )
          : cn(
              'flex min-w-16 flex-col items-center gap-1.5 rounded-lg border bg-surface px-2 py-2 text-caption text-fg transition-colors',
              checked
                ? 'border-accent ring-1 ring-accent'
                : 'border-border hover:bg-surface-sunken',
            ),
        option.disabled && 'cursor-not-allowed text-fg-disabled opacity-60 hover:bg-surface',
        className,
      )}
    >
      {/* Por cima da peca toda: o clique em qualquer ponto escolhe, e o anel de foco
          do navegador contorna a peca. */}
      <input
        type="radio"
        name={name}
        value={option.value}
        checked={checked}
        disabled={option.disabled}
        onChange={onSelect}
        aria-label={option.hideLabel ? option.label : undefined}
        title={option.hideLabel ? option.label : undefined}
        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-lg disabled:cursor-not-allowed"
      />
      {look === 'pill' ? (
        option.label
      ) : (
        <>
          {option.drawing}
          {!option.hideLabel && <span className="leading-tight">{option.label}</span>}
          {option.note && <span className="text-fg-muted leading-tight">{option.note}</span>}
          {checked && <Visto />}
        </>
      )}
    </label>
  )
}

/** O visto da peca marcada, no canto: o anel diz "esta", o visto confirma sem cor. */
function Visto() {
  return (
    <span
      aria-hidden
      className="-top-1.5 -right-1.5 pointer-events-none absolute flex size-4 items-center justify-center rounded-full bg-accent text-accent-fg"
    >
      <svg
        viewBox="0 0 12 12"
        className="size-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m2.5 6.5 2.5 2.5 4.5-6" />
      </svg>
    </span>
  )
}

export function Choice({
  selected,
  disabled,
  onSelect,
  children,
  label,
  className,
}: {
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  children: React.ReactNode
  /** O nome, quando o conteudo e so um desenho. Vira tambem a dica. */
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'h-8 rounded-lg border px-3 text-detail transition-colors',
        'disabled:cursor-not-allowed disabled:text-fg-disabled',
        selected
          ? 'border-transparent bg-accent font-medium text-accent-fg'
          : 'border-border bg-surface text-fg enabled:hover:bg-surface-sunken',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Check({
  id,
  checked,
  onChange,
  label,
}: {
  /** A ancora da caixa: a busca leva ate ela. */
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label id={id} className="flex scroll-mt-6 items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 flex-none accent-accent"
      />
      <span className="text-body text-fg">{label}</span>
    </label>
  )
}

/** Uma frase de ajuda embaixo de um controle. */
export function Hint({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('mt-2 text-detail text-fg-muted leading-relaxed', className)}>{children}</p>
  )
}
