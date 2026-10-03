namespace Pds.Domain.Entities;

/// <summary>
/// Como o time trabalha neste projeto. Hoje, o prazo do convite; e onde as outras
/// regras do time vao morar quando chegarem.
///
/// <para>Uma linha por projeto, criada so quando alguem salva — os padroes vivem em
/// <see cref="TeamSettingsDefaults"/>, e projeto sem linha e projeto que nunca
/// precisou mudar nada. Mesmo desenho da configuracao do ciclo.</para>
/// </summary>
public class ProjectTeamSettings : PdsBaseEntity
{
    /// <summary>O menor prazo de convite: um dia.</summary>
    public const int MinInvitationValidityDays = 1;

    /// <summary>O maior prazo de convite: um link esquecido nao fica valendo para sempre.</summary>
    public const int MaxInvitationValidityDays = 30;

    /// <summary>Projeto dono da configuracao.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>Por quantos dias um convite vale, a contar do envio.</summary>
    public int InvitationValidityDays { get; set; } = TeamSettingsDefaults.InvitationValidityDays;
}

/// <summary>
/// O que vale quando ninguem configurou nada. Projeto novo tem de andar sem ninguem
/// abrir a tela de configuracao.
/// </summary>
public static class TeamSettingsDefaults
{
    /// <summary>
    /// Uma semana: cobre quem so le e-mail no fim de semana, e um link esquecido
    /// nao fica valendo por muito tempo.
    /// </summary>
    public const int InvitationValidityDays = 7;
}
