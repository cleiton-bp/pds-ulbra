using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectOriginRepository : IBaseRepository<ProjectOrigin>
{
    /// <summary>Enderecos autorizados do projeto, em ordem alfabetica.</summary>
    Task<IReadOnlyList<ProjectOrigin>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>Este dominio ja esta autorizado no projeto?</summary>
    Task<bool> DomainExistsAsync(long projectId, string domain, CancellationToken cancellationToken = default);

    /// <summary>Quantos enderecos o projeto ja autorizou.</summary>
    Task<int> CountByProjectAsync(long projectId, CancellationToken cancellationToken = default);
}
