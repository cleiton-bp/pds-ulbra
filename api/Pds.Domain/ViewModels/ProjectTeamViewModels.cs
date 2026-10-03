using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Alguem do time. O dono da conta aparece como administrador, marcado com
/// <paramref name="IsAccountOwner"/> — ele nao tem linha em project_members, e nao
/// sai nem muda de papel.
/// </summary>
/// <param name="UserPublicId">A pessoa.</param>
/// <param name="Name">Nome vindo do Google.</param>
/// <param name="Email">E-mail vindo do Google.</param>
/// <param name="AvatarUrl">Foto vinda do Google.</param>
/// <param name="Role">O papel neste projeto.</param>
/// <param name="IsAccountOwner">Se e dona da conta do projeto.</param>
/// <param name="IsYou">Se e quem esta vendo a lista.</param>
/// <param name="JoinedAt">Quando entrou no time. Nulo para o dono.</param>
public record TeamMemberViewModel(
    Guid UserPublicId,
    string? Name,
    string? Email,
    string? AvatarUrl,
    ProjectRoleEnum Role,
    bool IsAccountOwner,
    bool IsYou,
    DateTime? JoinedAt);

/// <summary>
/// Um convite aberto. O link nao aparece aqui, nem em lugar nenhum: so existe
/// dentro do e-mail.
/// </summary>
/// <param name="PublicId">O convite.</param>
/// <param name="Email">O endereco convidado.</param>
/// <param name="Role">O papel com que a pessoa entra.</param>
/// <param name="InvitedByName">Quem convidou (ou reenviou por ultimo).</param>
/// <param name="CreatedAt">Quando o convite nasceu.</param>
/// <param name="ExpiresAt">Ate quando vale.</param>
/// <param name="IsExpired">Se ja passou do prazo.</param>
/// <param name="EmailStatus">Onde esta o e-mail.</param>
/// <param name="EmailSentAt">Quando o servidor de e-mail aceitou a mensagem.</param>
public record ProjectInvitationViewModel(
    Guid PublicId,
    string Email,
    ProjectRoleEnum Role,
    string? InvitedByName,
    DateTime CreatedAt,
    DateTime ExpiresAt,
    bool IsExpired,
    InvitationEmailStatusEnum EmailStatus,
    DateTime? EmailSentAt);

/// <summary>
/// Os convites abertos do projeto e o que a tela precisa para oferecer convidar.
/// </summary>
/// <param name="Items">Convites abertos, do mais recente para o mais antigo.</param>
/// <param name="CanInvite">Se este servidor manda convite.</param>
/// <param name="UnavailableReason">Por que nao manda, quando nao manda.</param>
/// <param name="ValidityDays">Por quantos dias um convite novo vale.</param>
/// <param name="MaxPerHour">Quantos convites o projeto manda por hora.</param>
public record ProjectInvitationsViewModel(
    IReadOnlyList<ProjectInvitationViewModel> Items,
    bool CanInvite,
    InvitationUnavailableReasonEnum? UnavailableReason,
    int ValidityDays,
    int MaxPerHour);

/// <summary>A configuracao do time do projeto.</summary>
/// <param name="InvitationValidityDays">Por quantos dias um convite vale.</param>
public record TeamSettingsViewModel(int InvitationValidityDays);

/// <summary>
/// O que a pessoa ve ao abrir o link. Os dados do projeto so vem quando a conta
/// e a convidada — com a conta errada, vem so a pista do endereco.
/// </summary>
/// <param name="Status">O que fazer com o convite.</param>
/// <param name="ProjectPublicId">O projeto, quando a conta e a convidada.</param>
/// <param name="ProjectName">O nome do projeto, quando a conta e a convidada.</param>
/// <param name="InvitedByName">Quem convidou, quando a conta e a convidada.</param>
/// <param name="Role">O papel, quando a conta e a convidada.</param>
/// <param name="ExpiresAt">Ate quando vale, quando a conta e a convidada.</param>
/// <param name="InvitedEmailHint">Pista do endereco convidado (c•••@gmail.com), com a conta errada.</param>
public record InvitationPreviewViewModel(
    InvitationPreviewStatusEnum Status,
    Guid? ProjectPublicId,
    string? ProjectName,
    string? InvitedByName,
    ProjectRoleEnum? Role,
    DateTime? ExpiresAt,
    string? InvitedEmailHint);

/// <summary>O projeto em que a pessoa acabou de entrar.</summary>
/// <param name="ProjectPublicId">Para onde o painel leva.</param>
/// <param name="ProjectName">Nome do projeto.</param>
public record AcceptedInvitationViewModel(Guid ProjectPublicId, string ProjectName);
