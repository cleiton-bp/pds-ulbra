import { create } from 'zustand'

/**
 * Escreve `data-theme` na raiz e mais nada: nenhum componente sabe qual tema esta
 * ativo, porque quem muda sao as variaveis de `styles/tokens.css`. A escolha
 * guardada vence a do sistema.
 */
type Theme = 'light' | 'dark'

/**
 * Esta chave e esta precedencia estao repetidas num script inline do
 * `index.html`, que roda antes do bundle — e o unico jeito de nao piscar o tema
 * errado no primeiro quadro. Mexeu aqui, mexa la.
 */
const STORAGE_KEY = 'pds.web.theme.v1'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStored(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

interface ThemeState {
  theme: Theme
  toggle: () => void
}

const initial = readStored() ?? systemTheme()
apply(initial)

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initial,
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    apply(next)

    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Armazenamento bloqueado: o tema vale para esta visita e pronto.
    }

    set({ theme: next })
  },
}))

/**
 * O rotulo diz para **onde a pessoa vai**, nao onde ela esta — e o que resolve a
 * duvida que icone de sol e lua sempre deixa. Derivado e nao guardado: dois campos
 * para um fato so ficam certos ate o dia em que alguem escreve um sem o outro.
 */
export const selectThemeLabel = (state: ThemeState): string =>
  state.theme === 'dark' ? 'Tema claro' : 'Tema escuro'
