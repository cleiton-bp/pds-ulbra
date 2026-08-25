import type { MeViewModel, SignInViewModel } from '@/contracts'
import type { AuthService } from '@/data/authService'
import { demoDatabase } from '@/data/mock/demoDatabase'
import type { MockDatabase } from '@/data/mock/mockDatabase'
import { delay, requireSession } from '@/data/mock/mockInternals'
import { clearToken, setToken } from '@/data/sessionToken'
import { decodeJwtPayload } from '@/shared/lib/jwt'

/** Mesmo padrao da API (`JWT_EXPIRATION_HOURS`). */
const SESSION_HOURS = 8
const MOCK_ACCESS_TOKEN = 'mock.session.token'

/** Igual ao `BuildAccountName` do `AuthService`. */
function buildAccountName(name?: string, email?: string): string {
  if (name?.trim()) return `Conta de ${name.trim()}`
  if (email?.trim()) return `Conta de ${email.split('@')[0]}`
  return 'Minha conta'
}

export function createMockAuthService(database: MockDatabase): AuthService {
  const currentUser = (): MeViewModel => {
    const state = database.read()
    return { ...state.user, Account: state.account }
  }

  return {
    async signIn(googleIdToken: string | null): Promise<SignInViewModel> {
      await delay()

      // Com Google configurado o nome e a foto sao os de verdade: o token veio
      // assinado, so nao foi conferido por ninguem. Sem Google, entra o seed.
      const claims = googleIdToken ? decodeJwtPayload(googleIdToken) : null

      if (claims) {
        database.write((state) => {
          state.user.Name = claims.name ?? state.user.Name
          state.user.Email = claims.email ?? state.user.Email
          state.user.AvatarUrl = claims.picture ?? null
          state.account.Name = buildAccountName(claims.name, claims.email)
        })
      }

      setToken(MOCK_ACCESS_TOKEN)

      return {
        AccessToken: MOCK_ACCESS_TOKEN,
        ExpiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString(),
        User: currentUser(),
      }
    },

    async signOut(): Promise<void> {
      await delay()
      clearToken()
    },

    async getCurrentUser(): Promise<MeViewModel> {
      await delay()
      requireSession()
      return currentUser()
    },
  }
}

export const mockAuthService = createMockAuthService(demoDatabase)
