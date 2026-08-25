/**
 * Espelho de `Pds.Domain/ViewModels/AuthViewModels.cs`.
 * Datas sao texto ISO-8601 em UTC, nunca `Date` — converter so na borda.
 */

/** Fronteira de isolamento: todo dado pertence a uma conta. */
export interface AccountViewModel {
  PublicId: string
  Name: string
  CreatedAt: string
}

export interface MeViewModel {
  PublicId: string
  Name: string | null
  /** Vem do Google. Serve para contato, nunca como identidade. */
  Email: string | null
  AvatarUrl: string | null
  /** Acesso anterior a este. Nulo no primeiro acesso. */
  LastLoginAt: string | null
  Account: AccountViewModel
}

export interface SignInViewModel {
  /** Vai no `Authorization: Bearer` das demais rotas. */
  AccessToken: string
  ExpiresAt: string
  User: MeViewModel
}
