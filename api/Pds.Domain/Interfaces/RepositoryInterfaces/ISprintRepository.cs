using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface ISprintRepository : IBaseRepository<Sprint>
{
    /// <summary>As sprints que nao fecharam: a em andamento primeiro, depois as planejadas, pelo numero.</summary>
    Task<IReadOnlyList<Sprint>> ListOpenAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>As sprints concluidas, da mais recente para a mais antiga.</summary>
    Task<IReadOnlyList<Sprint>> ListClosedAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>Uma sprint do projeto, rastreada.</summary>
    Task<Sprint?> FindAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>A sprint em andamento do projeto, rastreada, ou nula.</summary>
    Task<Sprint?> FindActiveAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A ultima sprint que nao fechou, pelo fim — de onde a proxima comeca. <paramref name="exceptId"/>
    /// fica de fora: a sprint que esta sendo concluida ainda nao fechou no banco.
    /// </summary>
    Task<DateOnly?> FindLastEndAsync(long projectId, long? exceptId = null, CancellationToken cancellationToken = default);
}
