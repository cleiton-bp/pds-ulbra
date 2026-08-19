using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectKeyRepository : IBaseRepository<ProjectKey>
{
    /// <summary>Todas as chaves do projeto, incluindo as revogadas, da mais nova para a mais antiga.</summary>
    Task<IReadOnlyList<ProjectKey>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>A chave do tipo informado que vale agora no projeto, ou nulo se nao houver.</summary>
    Task<ProjectKey?> GetActiveAsync(long projectId, ProjectKeyTypeEnum type, CancellationToken cancellationToken = default);
}
