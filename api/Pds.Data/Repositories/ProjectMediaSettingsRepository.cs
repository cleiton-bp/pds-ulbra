using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectMediaSettingsRepository
    : BaseRepository<ProjectMediaSettings, DataContext>, IProjectMediaSettingsRepository
{
    public ProjectMediaSettingsRepository(DataContext context) : base(context)
    {
    }

    public Task<ProjectMediaSettings?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectMediaSettings
            .Include(settings => settings.Kinds)
            .FirstOrDefaultAsync(settings => settings.ProjectId == projectId, cancellationToken);

    public Task<ProjectMediaSettings?> FindByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a da conta — o mesmo
        // desenho da configuracao da ferramenta e das regras do ciclo.
        //
        // **O filtro dos tipos cai junto**, e por isso a condicao deles tambem e
        // reescrita: `IgnoreQueryFilters` vale para a consulta inteira, entao sem
        // isto o `Include` traria tambem o tipo apagado logicamente.
        => Context.ProjectMediaSettings
            .IgnoreQueryFilters()
            .Include(settings => settings.Kinds.Where(kind => kind.DeletedAt == null))
            .FirstOrDefaultAsync(settings => settings.ProjectId == projectId
                                             && settings.DeletedAt == null
                                             && settings.Project.DeletedAt == null,
                cancellationToken);
}
