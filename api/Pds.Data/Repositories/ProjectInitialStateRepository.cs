using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectInitialStateRepository : BaseRepository<ProjectInitialState, DataContext>, IProjectInitialStateRepository
{
    public ProjectInitialStateRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectInitialState>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => await Context.ProjectInitialStates
            .Where(initial => initial.ProjectId == projectId)
            .ToListAsync(cancellationToken);

    public Task<ProjectInitialState?> FindByTypeAsync(long projectId, ReportTypeEnum reportType, CancellationToken cancellationToken = default)
        => Context.ProjectInitialStates
            .FirstOrDefaultAsync(initial => initial.ProjectId == projectId && initial.ReportType == reportType, cancellationToken);

    public Task<ProjectInitialState?> FindByTypeWithoutSessionAsync(long projectId, ReportTypeEnum reportType, CancellationToken cancellationToken = default)
        // Desliga o filtro global e reescreve as condicoes a mao, como a busca da
        // chave publica e a do endereco autorizado: o que o filtro dava de graca era
        // a conta da sessao, e aqui nao ha sessao nenhuma.
        => Context.ProjectInitialStates
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(initial => initial.ProjectId == projectId
                                            && initial.ReportType == reportType
                                            && initial.DeletedAt == null
                                            && initial.Project.DeletedAt == null,
                cancellationToken);

    public Task<bool> AnyUsingStateAsync(long projectStateId, CancellationToken cancellationToken = default)
        => Context.ProjectInitialStates
            .AnyAsync(initial => initial.ProjectStateId == projectStateId, cancellationToken);
}
