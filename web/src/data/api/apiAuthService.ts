import type {
  AccountDeletionPreviewViewModel,
  AccountDeletionRequestedViewModel,
  MeViewModel,
  SignInViewModel,
} from '@/contracts'
import { apiGet, apiPost } from '@/data/api/httpClient'
import type { AuthService } from '@/data/authService'
import { clearToken, setToken } from '@/data/sessionToken'

export const apiAuthService: AuthService = {
  async signIn(googleIdToken: string): Promise<SignInViewModel> {
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
  getDeletionPreview(): Promise<AccountDeletionPreviewViewModel> {
    return apiGet<AccountDeletionPreviewViewModel>('/me/deletion')
  },
  async requestDeletion(): Promise<AccountDeletionRequestedViewModel> {
    const pedido = await apiPost<AccountDeletionRequestedViewModel>('/me/deletion')
    // A sessao acabou no servidor junto com o pedido: o token guardado ja nao abre nada.
    clearToken()
    return pedido
  },
}
