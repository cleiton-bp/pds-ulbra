/**
 * Espelho de `Pds.Domain/ViewModels/AuthViewModels.cs`.
 * Datas sao texto ISO-8601 em UTC, nunca `Date` — converter so na borda.
 */

/**
 * A conta propria da pessoa — a que nasceu no primeiro acesso, onde nascem os
 * projetos que ela cria. Os projetos de outras contas chegam pela lista de projetos,
 * cada um com a sua conta.
 */
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
  /**
   * A conta estava no prazo de exclusao, e este login a cancelou: os projetos voltaram
   * como estavam. O painel avisa, porque e o desfazer que a pessoa procurava.
   */
  DeletionCancelled: boolean
}

/** O que o dialogo de exclusao mostra antes da confirmacao, contado no banco. */
export interface AccountDeletionPreviewViewModel {
  /** Projetos da conta, que saem do ar no pedido e somem no fim do prazo. */
  Projects: number
  /** Relatos e cards desses projetos. */
  Reports: number
  /** Pessoas de outras contas no time desses projetos, que perdem o acesso no pedido. */
  TeamMembers: number
  /** Projetos de outras contas em que a pessoa esta no time. */
  OtherProjects: number
  /** Horas para desistir, entrando de novo. */
  GraceHours: number
}

/** A exclusao pedida: quando ela vira definitiva. */
export interface AccountDeletionRequestedViewModel {
  /** Em UTC (ISO 8601). Entrar no painel antes disso cancela. */
  PurgeAt: string
}
