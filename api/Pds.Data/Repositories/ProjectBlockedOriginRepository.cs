using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectBlockedOriginRepository : BaseRepository<ProjectBlockedOrigin, DataContext>, IProjectBlockedOriginRepository
{
    public ProjectBlockedOriginRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectBlockedOrigin>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        // Do mais novo para o mais antigo: quem abre a lista quer achar o que acabou de
        // bloquear, e e o mais novo que costuma ter cards marcados para revisar.
        => await Context.ProjectBlockedOrigins
            .Include(blocked => blocked.BlockedByUser)
            .Where(blocked => blocked.ProjectId == projectId)
            .OrderByDescending(blocked => blocked.CreatedAt)
            .ThenBy(blocked => blocked.Id)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ProjectBlockedOrigin>> ListByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default)
        // Desliga o filtro global e reescreve as condicoes a mao, como a lista de
        // autorizados: o que o filtro dava de graca eram os projetos da sessao, e aqui
        // nao ha sessao nenhuma.
        => await Context.ProjectBlockedOrigins
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(blocked => blocked.ProjectId == projectId
                              && blocked.DeletedAt == null
                              && blocked.Project.DeletedAt == null)
            .ToListAsync(cancellationToken);

    public Task<ProjectBlockedOrigin?> FindByDomainAsync(long projectId, string domain, CancellationToken cancellationToken = default)
        // O dominio ja chega normalizado: a comparacao e a mesma do indice unico.
        => Context.ProjectBlockedOrigins
            .FirstOrDefaultAsync(blocked => blocked.ProjectId == projectId && blocked.Domain == domain, cancellationToken);

    public Task<int> CountByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectBlockedOrigins
            .CountAsync(blocked => blocked.ProjectId == projectId, cancellationToken);
}
