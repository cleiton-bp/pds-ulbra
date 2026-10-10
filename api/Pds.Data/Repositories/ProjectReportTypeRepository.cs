using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectReportTypeRepository : BaseRepository<ProjectReportType, DataContext>, IProjectReportTypeRepository
{
    /// <summary>
    /// O espaco da trava dos ativos, separado dos das outras travas consultivas para
    /// nenhuma esperar por engano o identificador de outra coisa.
    /// </summary>
    private const int ActiveCountLockSpace = 7005;

    public ProjectReportTypeRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectReportType>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        // O desempate pelo identificador, como nas prioridades: a posicao nao e unica.
        => await Context.ProjectReportTypes
            .Where(type => type.ProjectId == projectId)
            .OrderBy(type => type.Position)
            .ThenBy(type => type.Id)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ProjectReportType>> ListByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default)
        // Desliga o filtro global e reescreve as condicoes a mao, como a configuracao da
        // ferramenta: o que o filtro dava de graca eram os projetos da sessao, e aqui nao
        // ha sessao nenhuma. O mesmo desempate da lista do painel — a ferramenta e o
        // painel precisam concordar sobre qual e o primeiro.
        => await Context.ProjectReportTypes
            .IgnoreQueryFilters()
            .Where(type => type.ProjectId == projectId
                           && type.DeletedAt == null
                           && type.Project.DeletedAt == null)
            .OrderBy(type => type.Position)
            .ThenBy(type => type.Id)
            .ToListAsync(cancellationToken);

    public Task<ProjectReportType?> FindByPublicIdWithoutSessionAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default)
        => Context.ProjectReportTypes
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(type => type.ProjectId == projectId
                                         && type.PublicId == publicId
                                         && type.DeletedAt == null
                                         && type.Project.DeletedAt == null,
                cancellationToken);

    public Task<bool> NameExistsAsync(long projectId, string name, long? exceptId = null, CancellationToken cancellationToken = default)
        // Sem diferenciar maiuscula, como o nome da prioridade.
        => Context.ProjectReportTypes
            .AnyAsync(type => type.ProjectId == projectId
                              && type.Name.ToLower() == name.ToLower()
                              && (exceptId == null || type.Id != exceptId),
                cancellationToken);

    public async Task<int?> LastPositionAsync(long projectId, CancellationToken cancellationToken = default)
        => await Context.ProjectReportTypes
            .Where(type => type.ProjectId == projectId)
            .Select(type => (int?)type.Position)
            .MaxAsync(cancellationToken);

    public Task<int> CountActiveAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.ProjectReportTypes
            .CountAsync(type => type.ProjectId == projectId && type.DeactivatedAt == null, cancellationToken);

    public Task LockActiveCountAsync(long projectId, CancellationToken cancellationToken = default)
    {
        // Como nas outras travas consultivas: fora de uma transacao ela nao seguraria
        // nada, e por isso quebra alto.
        if (Context.Database.CurrentTransaction is null)
            throw new InvalidOperationException("A trava dos tipos ativos so vale dentro de uma transacao.");

        var projeto = unchecked((int)projectId);

        return Context.Database.ExecuteSqlAsync(
            $"SELECT pg_advisory_xact_lock({ActiveCountLockSpace}, {projeto})",
            cancellationToken);
    }

    public Task<bool> AnyUsingStateAsync(long projectStateId, CancellationToken cancellationToken = default)
        // Os desativados contam: reativar um tipo faria o relato seguinte cair numa
        // coluna aposentada, que e o que aposentar existe para impedir.
        => Context.ProjectReportTypes
            .AnyAsync(type => type.InitialStateId == projectStateId, cancellationToken);
}
