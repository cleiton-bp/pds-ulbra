using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectLabelRepository : BaseRepository<ProjectLabel, DataContext>, IProjectLabelRepository
{
    /// <summary>
    /// O espaco da trava dos nomes. Arbitrario; so precisa nao mudar nem repetir outro
    /// — o 7001 e o da cota de anexos, e o 7002 o dos campos do card.
    /// </summary>
    private const int LabelNamesLockSpace = 7003;

    public ProjectLabelRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectLabel>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        // Em ordem de nome: etiqueta nao tem sequencia, e quem procura uma procura
        // pelo nome.
        => await Context.ProjectLabels
            .Where(label => label.ProjectId == projectId)
            .OrderBy(label => label.Name)
            .ThenBy(label => label.Id)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ProjectLabel>> ListByPublicIdsAsync(long projectId, IReadOnlyCollection<Guid> publicIds, CancellationToken cancellationToken = default)
        => await Context.ProjectLabels
            .Where(label => label.ProjectId == projectId && publicIds.Contains(label.PublicId))
            .ToListAsync(cancellationToken);

    public Task<bool> NameExistsAsync(long projectId, string name, long? exceptId = null, CancellationToken cancellationToken = default)
        => Context.ProjectLabels
            .AnyAsync(label => label.ProjectId == projectId
                               && label.Name.ToLower() == name.ToLower()
                               && (exceptId == null || label.Id != exceptId),
                cancellationToken);

    public Task<ProjectLabel?> FindByNameAsync(long projectId, string name, CancellationToken cancellationToken = default)
        => Context.ProjectLabels
            .FirstOrDefaultAsync(label => label.ProjectId == projectId && label.Name.ToLower() == name.ToLower(),
                cancellationToken);

    public Task LockNamesAsync(long projectId, CancellationToken cancellationToken = default)
    {
        // Como nas outras travas consultivas: fora de uma transacao ela nao seguraria
        // nada, e por isso quebra alto.
        if (Context.Database.CurrentTransaction is null)
            throw new InvalidOperationException("A trava dos nomes das etiquetas so vale dentro de uma transacao.");

        var projeto = unchecked((int)projectId);

        return Context.Database.ExecuteSqlAsync(
            $"SELECT pg_advisory_xact_lock({LabelNamesLockSpace}, {projeto})",
            cancellationToken);
    }

    public async Task<IReadOnlyDictionary<long, int>> CountCardsAsync(long projectId, CancellationToken cancellationToken = default)
        // Arquivados inclusive: apagar a etiqueta tira dela tambem.
        => await Context.ReportLabels
            .Where(link => link.ProjectLabel.ProjectId == projectId)
            .GroupBy(link => link.ProjectLabelId)
            .Select(group => new { group.Key, Total = group.Count() })
            .ToDictionaryAsync(row => row.Key, row => row.Total, cancellationToken);

    public async Task<IReadOnlyDictionary<CardColorEnum, int>> CountByColorAsync(long projectId, CancellationToken cancellationToken = default)
        => await Context.ProjectLabels
            .Where(label => label.ProjectId == projectId)
            .GroupBy(label => label.Color)
            .Select(group => new { group.Key, Total = group.Count() })
            .ToDictionaryAsync(row => row.Key, row => row.Total, cancellationToken);
}
