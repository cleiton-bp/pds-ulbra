/** Espelho de `Pds.Domain/ViewModels/ProjectTeamViewModels.cs` e dos DTOs do time. */
import type { ProjectRole } from '@/contracts/project'

/**
 * Alguem do time. O dono da conta vem como `Administrator` com `IsAccountOwner`:
 * ele nao tem linha de membro, e nao sai nem muda de papel.
 */
export interface TeamMemberViewModel {
  UserPublicId: string
  Name: string | null
  Email: string | null
  AvatarUrl: string | null
  Role: ProjectRole
  IsAccountOwner: boolean
  /** Quem esta vendo a lista. */
  IsYou: boolean
  /** Quando entrou no time. Nulo para o dono. */
  JoinedAt: string | null
}

/** Onde esta o e-mail do convite. O texto do e-mail nao e guardado em lugar nenhum. */
export type InvitationEmailStatus = 'Pending' | 'Sending' | 'Sent' | 'Failed'

/**
 * Um convite aberto — nem aceito, nem cancelado. Vencido continua aberto, para
 * poder ser reenviado. O link nao vem: ele so existe dentro do e-mail.
 */
export interface ProjectInvitationViewModel {
  PublicId: string
  Email: string
  Role: ProjectRole
  InvitedByName: string | null
  CreatedAt: string
  ExpiresAt: string
  IsExpired: boolean
  EmailStatus: InvitationEmailStatus
  EmailSentAt: string | null
}

/** Por que este servidor nao manda convite. Quem cuida do servidor resolve no `.env.local`. */
export type InvitationUnavailableReason =
  | 'EmailNotConfigured'
  | 'QueueNotConfigured'
  | 'PanelUrlNotConfigured'

export interface ProjectInvitationsViewModel {
  Items: ProjectInvitationViewModel[]
  CanInvite: boolean
  UnavailableReason: InvitationUnavailableReason | null
  /** Por quantos dias um convite novo vale. */
  ValidityDays: number
  /** Quantos convites o projeto manda por hora. */
  MaxPerHour: number
}

export interface CreateInvitationRequest {
  Email: string
  Role: ProjectRole
}

export interface ChangeMemberRoleRequest {
  Role: ProjectRole
}

export interface TeamSettingsViewModel {
  InvitationValidityDays: number
}

export interface SaveTeamSettingsRequest {
  InvitationValidityDays: number
}

/** O menor e o maior prazo de convite — os mesmos da API e do CHECK do banco. */
export const MIN_INVITATION_VALIDITY_DAYS = 1
export const MAX_INVITATION_VALIDITY_DAYS = 30

/** O que a pessoa ve ao abrir o link do convite, ja com a sessao dela. */
export type InvitationPreviewStatus =
  | 'Valid'
  | 'WrongAccount'
  | 'EmailNotVerified'
  | 'Expired'
  | 'AlreadyAccepted'
  | 'AlreadyMember'

/**
 * Com a conta convidada, vem o projeto; com outra conta, so a pista do endereco
 * (`c•••@gmail.com`) — nada do projeto.
 */
export interface InvitationPreviewViewModel {
  Status: InvitationPreviewStatus
  ProjectPublicId: string | null
  ProjectName: string | null
  InvitedByName: string | null
  Role: ProjectRole | null
  ExpiresAt: string | null
  InvitedEmailHint: string | null
}

export interface AcceptedInvitationViewModel {
  ProjectPublicId: string
  ProjectName: string
}
