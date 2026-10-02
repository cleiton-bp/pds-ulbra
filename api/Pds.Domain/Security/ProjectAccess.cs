using Pds.Domain.Enums;

namespace Pds.Domain.Security;

/// <summary>
/// Um projeto que a pessoa da requisicao enxerga, e o que ela pode fazer nele.
///
/// <para>Vem de dois lugares, e o resultado e o mesmo: os projetos da conta
/// propria, em que ela e dona — e por isso administradora —, e os de outras
/// contas em que entrou pelo time, com o papel que recebeu.</para>
/// </summary>
/// <param name="ProjectId">Chave interna do projeto. E o que o filtro global compara.</param>
/// <param name="ProjectPublicId">Identificador publico, o que chega pela rota.</param>
/// <param name="Role">O papel neste projeto. O dono e sempre administrador.</param>
/// <param name="IsAccountOwner">A pessoa e dona da conta deste projeto.</param>
public sealed record ProjectAccess(
    long ProjectId,
    Guid ProjectPublicId,
    ProjectRoleEnum Role,
    bool IsAccountOwner)
{
    /// <summary>Pode mudar a configuracao do projeto e decidir quem entra.</summary>
    public bool IsAdministrator => Role == ProjectRoleEnum.Administrator;
}
