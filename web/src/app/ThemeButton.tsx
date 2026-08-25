import { selectThemeLabel, useThemeStore } from '@/app/themeStore'

/** Texto e nao icone, como no design. O rotulo vem de `selectThemeLabel`. */
export function ThemeButton() {
  const label = useThemeStore(selectThemeLabel)
  const toggle = useThemeStore((state) => state.toggle)

  return (
    <button
      type="button"
      onClick={toggle}
      className="h-8 rounded-lg border border-border bg-surface-raised px-3 text-detail text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
    >
      {label}
    </button>
  )
}
