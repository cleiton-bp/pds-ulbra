using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectCycleSettingsRepository
    : BaseRepository<ProjectCycleSettings, DataContext>, IProjectCycleSettingsRepository
{
    public ProjectCycleSettingsRepository(DataContext context) : base(context)
    {
    }

    public Task<ProjectCycleSettings?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectCycleSettings
            .FirstOrDefaultAsync(settings => settings.ProjectId == projectId, cancellationToken);

    public Task<ProjectCycleSettings?> FindByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a da conta — o mesmo
        // desenho da configuracao da ferramenta.
        //
        // A coluna de destino da reabertura vem junto: quem le isto sem sessao e a
        // propria reabertura, e buscar o estado depois esbarraria no filtro global
        // — la a conta atual e zero, e a consulta voltaria vazia sem erro nenhum.
        => Context.ProjectCycleSettings
            .IgnoreQueryFilters()
            .Include(settings => settings.ReopenState)
            .FirstOrDefaultAsync(settings => settings.ProjectId == projectId
                                             && settings.DeletedAt == null
                                             && settings.Project.DeletedAt == null,
                cancellationToken);
}
