using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Domain.Security;

/// <summary>
/// Implementacao mutavel e por requisicao do <see cref="IAccountContext"/>. O
/// middleware preenche no inicio; dali em diante todo mundo so le.
///
/// Fica registrada duas vezes no container, como classe concreta (para o
/// middleware escrever) e como interface (para o resto ler). E o mesmo objeto: a
/// separacao e so para deixar claro quem tem permissao de preencher.
/// </summary>
public class AccountContext : IAccountContext
{
    private IReadOnlyList<ProjectAccess> _projects = [];

    // Vetor, e nao lista: e o tipo que o filtro global passa ao banco como um
    // parametro so. Vazio quando nao ha sessao, e vazio nao enxerga nada.
    private long[] _projectIds = [];

    public long? AccountId { get; set; }
    public Guid? AccountPublicId { get; set; }
    public long? UserId { get; set; }
    public Guid? UserPublicId { get; set; }

    public bool IsAuthenticated => UserId.HasValue && AccountId.HasValue;

    public IReadOnlyList<ProjectAccess> Projects => _projects;

    public IReadOnlyList<long> ProjectIds => _projectIds;

    public ProjectAccess? FindProject(Guid projectPublicId)
        => _projects.FirstOrDefault(access => access.ProjectPublicId == projectPublicId);

    public ProjectAccess? FindProject(long projectId)
        => _projects.FirstOrDefault(access => access.ProjectId == projectId);

    /// <summary>
    /// Troca os projetos da requisicao. Chamado pelo middleware, depois de ler a
    /// conta propria e o time; o filtro global passa a enxergar exatamente estes.
    /// </summary>
    public void SetProjects(IEnumerable<ProjectAccess> projects)
    {
        _projects = projects.ToList();
        _projectIds = _projects.Select(access => access.ProjectId).ToArray();
    }
}
