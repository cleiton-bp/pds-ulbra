import type {
  AcceptedInvitationViewModel,
  ChangeMemberRoleRequest,
  CreateInvitationRequest,
  InvitationPreviewViewModel,
  ProjectInvitationsViewModel,
  ProjectInvitationViewModel,
  SaveTeamSettingsRequest,
  TeamMemberViewModel,
  TeamSettingsViewModel,
} from '@/contracts'

/**
 * Espelha as rotas do time, da configuracao do time e dos convites da API.
 *
 * **O link do convite nao passa por aqui.** Convidar devolve o convite com o
 * e-mail na fila; o link so existe dentro do e-mail. Quem abre o link manda o que
 * veio nele no corpo do pedido — nunca na URL, que acaba em log de servidor.
 */
export interface ProjectTeamService {
  /** O time: o dono primeiro, depois quem entrou. Quem esta no projeto le. */
  listMembers(publicId: string): Promise<TeamMemberViewModel[]>

  /** Muda o papel de alguem. So administrador; o dono nao muda. */
  changeMemberRole(
    publicId: string,
    userPublicId: string,
    request: ChangeMemberRoleRequest,
  ): Promise<TeamMemberViewModel>

  /** Tira alguem do time. O acesso acaba na requisicao seguinte da pessoa. */
  removeMember(publicId: string, userPublicId: string): Promise<void>

  getTeamSettings(publicId: string): Promise<TeamSettingsViewModel>
  saveTeamSettings(
    publicId: string,
    request: SaveTeamSettingsRequest,
  ): Promise<TeamSettingsViewModel>

  /** Os convites abertos e se este servidor manda convite. So administrador. */
  listInvitations(publicId: string): Promise<ProjectInvitationsViewModel>

  /** Convida. Responde na hora, com o e-mail na fila. */
  createInvitation(
    publicId: string,
    request: CreateInvitationRequest,
  ): Promise<ProjectInvitationViewModel>

  /** Manda de novo, com prazo novo. O link anterior deixa de valer. */
  resendInvitation(
    publicId: string,
    invitationPublicId: string,
  ): Promise<ProjectInvitationViewModel>

  /** Cancela. O link deixa de valer. */
  revokeInvitation(publicId: string, invitationPublicId: string): Promise<void>

  /** O convite do link, para quem esta logado. */
  previewInvitation(token: string): Promise<InvitationPreviewViewModel>

  /** Aceita: quem esta logado entra no time. */
  acceptInvitation(token: string): Promise<AcceptedInvitationViewModel>
}
