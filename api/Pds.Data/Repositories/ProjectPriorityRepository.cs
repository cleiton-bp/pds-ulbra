using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectPriorityRepository : BaseRepository<ProjectPriority, DataContext>, IProjectPriorityRepository
{
    public ProjectPriorityRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectPriority>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        // O desempate pelo identificador, como nos estados: a posicao nao e unica.
        => await Context.ProjectPriorities
            .Where(priority => priority.ProjectId == projectId)
            .OrderBy(priority => priority.Position)
            .ThenBy(priority => priority.Id)
            .ToListAsync(cancellationToken);

    public Task<bool> NameExistsAsync(long projectId, string name, long? exceptId = null, CancellationToken cancellationToken = default)
        // Sem diferenciar maiuscula, como o nome do estado: o texto e escrito por uma
        // pessoa e vai para a tela do jeito que foi digitado.
        => Context.ProjectPriorities
            .AnyAsync(priority => priority.ProjectId == projectId
                                  && priority.Name.ToLower() == name.ToLower()
                                  && (exceptId == null || priority.Id != exceptId),
                cancellationToken);

    public async Task<int?> LastPositionAsync(long projectId, CancellationToken cancellationToken = default)
        => await Context.ProjectPriorities
            .Where(priority => priority.ProjectId == projectId)
            .Select(priority => (int?)priority.Position)
            .MaxAsync(cancellationToken);
}
