import type { MeViewModel, SignInViewModel } from '@/contracts'

/** Espelha o `AuthService` da API. Quem escolhe mock ou API e o `data/index.ts`. */
export interface AuthService {
  /**
   * Nao existe cadastro: `sub` novo cria conta e usuario na mesma chamada.
   * `null` significa "sem Google configurado" — o mock abre sessao de
   * demonstracao e a API recusa.
   */
  signIn(googleIdToken: string | null): Promise<SignInViewModel>

  signOut(): Promise<void>

  /** Primeira chamada ao abrir o painel: diz se o token guardado ainda vale. */
  getCurrentUser(): Promise<MeViewModel>
}
