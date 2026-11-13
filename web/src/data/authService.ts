import type {
  AccountDeletionPreviewViewModel,
  AccountDeletionRequestedViewModel,
  MeViewModel,
  SignInViewModel,
} from '@/contracts'

/** Espelha o `AuthService` da API. */
export interface AuthService {
  /** Nao existe cadastro: `sub` novo cria conta e usuario na mesma chamada. */
  signIn(googleIdToken: string): Promise<SignInViewModel>

  signOut(): Promise<void>

  /** Primeira chamada ao abrir o painel: diz se o token guardado ainda vale. */
  getCurrentUser(): Promise<MeViewModel>
  /** O que a exclusao da conta leva, para o dialogo de confirmacao. */
  getDeletionPreview(): Promise<AccountDeletionPreviewViewModel>
  /**
   * Pede a exclusao da conta. A API encerra todas as sessoes da pessoa no mesmo
   * movimento, entao o token guardado ja nao vale: ele e descartado aqui.
   */
  requestDeletion(): Promise<AccountDeletionRequestedViewModel>
}
