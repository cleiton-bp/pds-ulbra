/** Espelho de `Pds.Domain/ViewModels/ProjectKeyViewModels.cs`. */

/** `Public` identifica o projeto no navegador; `Secret` autentica servidor. */
export type ProjectKeyType = 'Public' | 'Secret'

export interface ProjectKeyViewModel {
  PublicId: string
  Type: ProjectKeyType
  /** Preenchido na publica e sempre nulo na secreta: o banco so guarda o hash. */
  Value: string | null
  /** Primeiros caracteres, para identificar a chave sem revela-la. */
  Prefix: string
  IsActive: boolean
  CreatedAt: string
  RevokedAt: string | null
  LastUsedAt: string | null
}

/** A secreta no momento em que nasce. Devolvida uma unica vez. */
export interface RevealedSecretKeyViewModel {
  PublicId: string
  Value: string
  Prefix: string
  CreatedAt: string
}
