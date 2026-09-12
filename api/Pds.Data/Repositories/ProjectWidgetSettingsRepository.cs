using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectWidgetSettingsRepository
    : BaseRepository<ProjectWidgetSettings, DataContext>, IProjectWidgetSettingsRepository
{
    public ProjectWidgetSettingsRepository(DataContext context) : base(context)
    {
    }

    public Task<ProjectWidgetSettings?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectWidgetSettings
            .FirstOrDefaultAsync(settings => settings.ProjectId == projectId, cancellationToken);

    public Task<ProjectWidgetSettings?> FindByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectWidgetSettings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(settings => settings.ProjectId == projectId
                                             && settings.DeletedAt == null
                                             && settings.Project.DeletedAt == null,
                cancellationToken);
}
