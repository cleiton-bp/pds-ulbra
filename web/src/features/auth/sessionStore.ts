import { create } from 'zustand'
import type { MeViewModel } from '@/contracts'
import { authService, describeError, getToken, isPanelError } from '@/data'
import { disableGoogleAutoSelect } from '@/features/auth/googleIdentity'

/**
 * `status` comeca em `unknown` e nao em `anonymous`: mandar para o login quem tem
 * sessao valida, so porque a resposta ainda nao chegou, faz o login piscar a cada
 * recarregamento.
 */
type SessionStatus = 'unknown' | 'loading' | 'authenticated' | 'anonymous'

interface SessionState {
  status: SessionStatus
  user: MeViewModel | null
  error: string | null
  restore: () => Promise<void>
  signIn: (googleIdToken: string) => Promise<void>
  signOut: () => Promise<void>
  /** Chamado quando a camada de dados avisa que a sessao expirou (401). */
  expire: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'unknown',
  user: null,
  error: null,

  async restore() {
    // Sem token nao ha o que retomar: perguntar seria chamada inutil em toda visita.
    if (!getToken()) {
      set({ status: 'anonymous', user: null })
      return
    }

    set({ status: 'loading' })

    try {
      const user = await authService.getCurrentUser()
      set({ status: 'authenticated', user, error: null })
    } catch (failure) {
      // 401 cai no login **sem** mensagem: quem voltou depois da sessao vencer nao
      // errou nada. Qualquer outra falha nao diz nada sobre a sessao, e mandar
      // para o login calado deixaria a pessoa sem entender por que. Quem descarta
      // o token em 401 e o `httpClient`, e por isso um F5 depois retoma a sessao.
      const expired = isPanelError(failure) && failure.status === 401
      set({
        status: 'anonymous',
        user: null,
        error: expired ? null : describeError(failure),
      })
    }
  },

  async signIn(googleIdToken) {
    set({ status: 'loading', error: null })

    try {
      const session = await authService.signIn(googleIdToken)
      set({ status: 'authenticated', user: session.User, error: null })
    } catch (error) {
      set({ status: 'anonymous', user: null, error: describeError(error) })
    }
  },

  async signOut() {
    try {
      await authService.signOut()
    } finally {
      disableGoogleAutoSelect()
      set({ status: 'anonymous', user: null, error: null })
    }
  },

  expire() {
    set({ status: 'anonymous', user: null, error: 'Sessão expirada. Entre de novo.' })
  },
}))
