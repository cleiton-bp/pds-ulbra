import { selectThemeLabel, useThemeStore } from '@/app/themeStore'

/**
 * Texto e nao icone, como no design. O rotulo vem de `selectThemeLabel`.
 *
 * **Some na tela estreita**: no celular o topo tem o seletor, o sino e a conta, e o
 * botao empurrava o menu da conta para fora da tela. O tema continua no menu da conta.
 */
export function ThemeButton() {
  const label = useThemeStore(selectThemeLabel)
  const toggle = useThemeStore((state) => state.toggle)

  return (
    <button
      type="button"
      onClick={toggle}
      className="hidden h-8 flex-none rounded-lg border border-border bg-surface-raised px-3 text-detail text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg sm:block"
    >
      {label}
    </button>
  )
}
