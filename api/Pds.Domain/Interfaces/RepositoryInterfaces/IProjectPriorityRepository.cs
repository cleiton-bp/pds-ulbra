using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectPriorityRepository : IBaseRepository<ProjectPriority>
{
    Task<IReadOnlyList<ProjectPriority>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    Task<bool> NameExistsAsync(long projectId, string name, long? exceptId = null, CancellationToken cancellationToken = default);

    Task<int?> LastPositionAsync(long projectId, CancellationToken cancellationToken = default);
}
