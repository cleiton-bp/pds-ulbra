using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectReportLimitsRepository
    : BaseRepository<ProjectReportLimits, DataContext>, IProjectReportLimitsRepository
{
    public ProjectReportLimitsRepository(DataContext context) : base(context)
    {
    }

    public Task<ProjectReportLimits?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectReportLimits
            .FirstOrDefaultAsync(limits => limits.ProjectId == projectId, cancellationToken);

    public Task<ProjectReportLimits?> FindByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a do acesso — o mesmo
        // desenho da identidade e das regras do ciclo.
        => Context.ProjectReportLimits
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(limits => limits.ProjectId == projectId
                                           && limits.DeletedAt == null
                                           && limits.Project.DeletedAt == null,
                cancellationToken);
}
