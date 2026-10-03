import type {
  AcceptedInvitationViewModel,
  InvitationPreviewViewModel,
  ProjectInvitationsViewModel,
  ProjectInvitationViewModel,
  TeamMemberViewModel,
  TeamSettingsViewModel,
} from '@/contracts'
import { apiDelete, apiGet, apiPost, apiPut } from '@/data/api/httpClient'
import type { ProjectTeamService } from '@/data/projectTeamService'

export const apiProjectTeamService: ProjectTeamService = {
  listMembers: (publicId) => apiGet<TeamMemberViewModel[]>(`/projects/${publicId}/members`),

  changeMemberRole: (publicId, userPublicId, request) =>
    apiPut<TeamMemberViewModel>(`/projects/${publicId}/members/${userPublicId}/role`, request),

  removeMember: (publicId, userPublicId) =>
    apiDelete(`/projects/${publicId}/members/${userPublicId}`),

  getTeamSettings: (publicId) =>
    apiGet<TeamSettingsViewModel>(`/projects/${publicId}/team-settings`),

  saveTeamSettings: (publicId, request) =>
    apiPut<TeamSettingsViewModel>(`/projects/${publicId}/team-settings`, request),

  listInvitations: (publicId) =>
    apiGet<ProjectInvitationsViewModel>(`/projects/${publicId}/invitations`),

  createInvitation: (publicId, request) =>
    apiPost<ProjectInvitationViewModel>(`/projects/${publicId}/invitations`, request),

  resendInvitation: (publicId, invitationPublicId) =>
    apiPost<ProjectInvitationViewModel>(
      `/projects/${publicId}/invitations/${invitationPublicId}/resend`,
    ),

  revokeInvitation: (publicId, invitationPublicId) =>
    apiDelete(`/projects/${publicId}/invitations/${invitationPublicId}`),

  previewInvitation: (token) =>
    apiPost<InvitationPreviewViewModel>('/invitations/preview', { Token: token }),

  acceptInvitation: (token) =>
    apiPost<AcceptedInvitationViewModel>('/invitations/accept', { Token: token }),
}
