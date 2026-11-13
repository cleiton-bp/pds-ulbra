import { create } from 'zustand'
import type { MeViewModel } from '@/contracts'
import { authService, describeError, getToken, isPanelError } from '@/data'
import { disableGoogleAutoSelect } from '@/features/auth/googleIdentity'
import { toast } from '@/shared/components/toastStore'
import { formatDateTime } from '@/shared/lib/datetime'

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
  /**
   * Um aviso calmo para a tela de entrada, que nao e erro: o de depois de pedir a exclusao
   * da conta, com o prazo e como desfazer.
   */
  notice: string | null
  restore: () => Promise<void>
  signIn: (googleIdToken: string) => Promise<void>
  signOut: () => Promise<void>
  /** Chamado quando a camada de dados avisa que a sessao expirou (401). */
  expire: () => void
  /**
   * A conta pediu exclusao: a API ja encerrou as sessoes e o token ja foi descartado. Volta
   * para a entrada com o prazo e o caminho de desfazer escritos.
   */
  endAfterDeletion: (purgeAt: string) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'unknown',
  user: null,
  error: null,
  notice: null,

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
      set({ status: 'authenticated', user: session.User, error: null, notice: null })
      // O desfazer que a pessoa procurava: ela precisa saber que funcionou.
      if (session.DeletionCancelled) {
        toast.done(
          'A exclusão da sua conta foi cancelada, e os seus projetos voltaram como estavam.',
          {
            durationMs: 10000,
          },
        )
      }
    } catch (error) {
      set({ status: 'anonymous', user: null, error: describeError(error) })
    }
  },

  async signOut() {
    try {
      await authService.signOut()
    } finally {
      disableGoogleAutoSelect()
      set({ status: 'anonymous', user: null, error: null, notice: null })
    }
  },

  expire() {
    set({ status: 'anonymous', user: null, error: 'Sessão expirada. Entre de novo.', notice: null })
  },

  endAfterDeletion(purgeAt) {
    // O Google nao entra sozinho de novo: entrar agora cancelaria a exclusao que a pessoa
    // acabou de pedir, e isso so pode acontecer porque ela quis.
    disableGoogleAutoSelect()
    set({
      status: 'anonymous',
      user: null,
      error: null,
      notice: `A exclusão da sua conta está marcada para ${formatDateTime(purgeAt)}, e até lá basta entrar de novo com o mesmo Google para desfazer.`,
    })
  },
}))
