namespace Pds.Domain.Filters;

/// <summary>O que a exclusao da conta leva, contado no banco, para o dialogo de confirmacao.</summary>
/// <param name="Projects">Projetos da conta ainda no ar.</param>
/// <param name="Reports">Relatos e cards desses projetos.</param>
/// <param name="TeamMembers">Pessoas de outras contas no time desses projetos.</param>
/// <param name="OtherProjects">Projetos de outras contas em que a pessoa esta no time.</param>
public record AccountDeletionCounts(int Projects, int Reports, int TeamMembers, int OtherProjects);

/// <summary>Um projeto da conta e as pessoas de fora que trabalham nele, para avisar que o acesso acabou.</summary>
/// <param name="ProjectPublicId">O projeto.</param>
/// <param name="MemberPublicIds">As pessoas do time que nao sao da conta.</param>
public record ProjectTeamToNotify(Guid ProjectPublicId, IReadOnlyList<Guid> MemberPublicIds);
