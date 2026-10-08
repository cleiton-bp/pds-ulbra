using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class SprintRepository : BaseRepository<Sprint, DataContext>, ISprintRepository
{
    public SprintRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<Sprint>> ListOpenAsync(long projectId, CancellationToken cancellationToken = default)
        => await Context.Sprints
            .AsNoTracking()
            .Where(sprint => sprint.ProjectId == projectId && sprint.State != SprintStateEnum.Closed)
            .OrderBy(sprint => sprint.State == SprintStateEnum.Active ? 0 : 1)
            .ThenBy(sprint => sprint.Number)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Sprint>> ListClosedAsync(long projectId, CancellationToken cancellationToken = default)
        // Pela data em que fechou; o numero desempata, e a mais nova fica em cima.
        => await Context.Sprints
            .AsNoTracking()
            .Where(sprint => sprint.ProjectId == projectId && sprint.State == SprintStateEnum.Closed)
            .OrderByDescending(sprint => sprint.ClosedAt)
            .ThenByDescending(sprint => sprint.Number)
            .ToListAsync(cancellationToken);

    public Task<Sprint?> FindAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default)
        => Context.Sprints.FirstOrDefaultAsync(sprint => sprint.ProjectId == projectId && sprint.PublicId == publicId, cancellationToken);

    public Task<Sprint?> FindActiveAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.Sprints.FirstOrDefaultAsync(sprint => sprint.ProjectId == projectId && sprint.State == SprintStateEnum.Active, cancellationToken);

    public Task<DateOnly?> FindLastEndAsync(long projectId, long? exceptId = null, CancellationToken cancellationToken = default)
        => Context.Sprints
            .Where(sprint => sprint.ProjectId == projectId
                             && sprint.State != SprintStateEnum.Closed
                             && sprint.Id != exceptId)
            .Select(sprint => (DateOnly?)sprint.EndsOn)
            .MaxAsync(cancellationToken);
}
