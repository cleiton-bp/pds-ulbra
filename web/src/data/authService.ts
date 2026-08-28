import type { MeViewModel, SignInViewModel } from '@/contracts'

/** Espelha o `AuthService` da API. */
export interface AuthService {
  /** Nao existe cadastro: `sub` novo cria conta e usuario na mesma chamada. */
  signIn(googleIdToken: string): Promise<SignInViewModel>

  signOut(): Promise<void>

  /** Primeira chamada ao abrir o painel: diz se o token guardado ainda vale. */
  getCurrentUser(): Promise<MeViewModel>
}
