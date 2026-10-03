using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>Convidar alguem para o time: o endereco e o papel com que vai entrar.</summary>
public class CreateInvitationDto
{
    public string? Email { get; set; }

    public ProjectRoleEnum? Role { get; set; }
}

/// <summary>O papel novo de alguem que ja esta no time.</summary>
public class ChangeMemberRoleDto
{
    public ProjectRoleEnum? Role { get; set; }
}

/// <summary>
/// O link do convite, como chegou no e-mail. Vai no corpo, e nunca na URL: URL
/// acaba em log de servidor, e o link e a credencial do convite.
/// </summary>
public class InvitationTokenDto
{
    public string? Token { get; set; }
}

/// <summary>A configuracao do time do projeto.</summary>
public class TeamSettingsDto
{
    public int? InvitationValidityDays { get; set; }
}
