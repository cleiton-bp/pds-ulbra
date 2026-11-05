import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Escreve `data-theme` na raiz e mais nada: nenhum componente sabe qual tema esta
 * ativo, porque quem muda sao as variaveis de `styles/tokens.css`. A escolha
 * guardada vence a do sistema.
 *
 * Em `shared` porque a tela de entrada tambem troca o tema, e tela puxando de `app/`
 * inverte a direcao da camada — o mesmo motivo da marca (`Brand`).
 */
type Theme = 'light' | 'dark'

/**
 * Esta chave e esta precedencia estao repetidas em `public/tema.js`, que roda antes
 * do bundle — e o unico jeito de nao piscar o tema errado no primeiro quadro. La ainda
 * vale o claro para quem nao tem sessao (a entrada publica). Mexeu aqui, mexa la.
 */
const STORAGE_KEY = 'pds.web.theme.v1'

function systemTheme(): Theme {
  // Sem `matchMedia` (navegador antigo, ambiente de teste), o claro: o modulo carrega na
  // abertura de toda tela, e quebrar aqui derrubaria o painel inteiro por uma preferencia.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStored(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

/** Ligado enquanto a entrada publica esta na tela (ver `useSempreClaro`). */
let claroForcado = false

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', claroForcado ? 'light' : theme)
}

interface ThemeState {
  theme: Theme
  toggle: () => void
}

const initial = readStored() ?? systemTheme()

// O `tema.js` ja pintou o primeiro quadro, e ele sabe se a pagina e a entrada publica.
// Reescrever aqui pintaria o escuro por um instante antes da entrada clara.
if (!document.documentElement.hasAttribute('data-theme')) apply(initial)

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

/**
 * A entrada publica e sempre clara, seja qual for o tema escolhido no painel. A escolha
 * continua guardada e volta sozinha quando a tela sai, ao entrar no painel.
 *
 * `ativo` falso deixa o tema da pessoa: e o caso de quem tem sessao e esta so esperando
 * ela abrir, que piscaria claro antes do painel escuro.
 */
export function useSempreClaro(ativo = true): void {
  useEffect(() => {
    if (!ativo) return

    claroForcado = true
    apply(useThemeStore.getState().theme)

    return () => {
      claroForcado = false
      apply(useThemeStore.getState().theme)
    }
  }, [ativo])
}
