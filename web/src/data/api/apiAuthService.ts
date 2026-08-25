import type { MeViewModel, SignInViewModel } from '@/contracts'
import { apiGet, apiPost } from '@/data/api/httpClient'
import type { AuthService } from '@/data/authService'
import { PanelError } from '@/data/errors'
import { clearToken, setToken } from '@/data/sessionToken'

/**
 * Escrito antes de haver API rodando de proposito: contrato so prova que fecha
 * quando alguem escreve o outro lado dele.
 */
export const apiAuthService: AuthService = {
  async signIn(googleIdToken: string | null): Promise<SignInViewModel> {
    // A API recusaria com 401, mas aqui a causa e configuracao e nao credencial.
    if (!googleIdToken) {
      throw new PanelError('Entrada pelo Google não configurada neste painel.', 401)
    }

    const session = await apiPost<SignInViewModel>(
      '/auth/google',
      { IdToken: googleIdToken },
      { handleUnauthorized: false },
    )

    setToken(session.AccessToken)
    return session
  },

  async signOut(): Promise<void> {
    try {
      // O token e autocontido e vale ate expirar; quem descarta e o painel. A
      // chamada existe para haver um lugar unico de "sair" quando houver revogacao.
      await apiPost<null>('/auth/logout')
    } finally {
      clearToken()
    }
  },

  getCurrentUser(): Promise<MeViewModel> {
    return apiGet<MeViewModel>('/me')
  },
}
