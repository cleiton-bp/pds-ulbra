using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ReportRepository : BaseRepository<Report, DataContext>, IReportRepository
{
    public ReportRepository(DataContext context) : base(context)
    {
    }

    public Task<bool> TrackingCodeExistsAsync(string trackingCode, CancellationToken cancellationToken = default)
        // Inclui o que foi apagado de proposito: a linha some da lista, mas o papel
        // com o protocolo continua na mao de alguem, e reaproveitar o codigo faria
        // duas pessoas diferentes digitarem o mesmo.
        => Context.Reports
            .IgnoreQueryFilters()
            .AnyAsync(report => report.TrackingCode == trackingCode, cancellationToken);

    public Task<Report?> FindByTrackingCodeWithoutSessionAsync(string trackingCode, CancellationToken cancellationToken = default)
        // Sem `DeletedAt == null`, e de proposito: o link de quem relatou continua
        // valendo depois de o relato sair da lista do painel.
        //
        // **E a segunda das cinco consultas que atravessam o filtro a dispensar essa
        // condicao** — a outra e a conferencia de protocolo repetido, oito linhas
        // acima. A diferenca entre as duas e o que importa: aquela devolve um
        // sim/nao, e esta devolve **conteudo** a quem apresenta um token. As tres
        // restantes reescrevem a condicao a mao.
        => Context.Reports
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(report => report.TrackingCode == trackingCode, cancellationToken);

    public async Task<IReadOnlyList<Report>> ListByProjectAsync(long projectId, int skip, int take, CancellationToken cancellationToken = default)
        // O filtro global ja isola por conta e esconde o que foi apagado; aqui so
        // resta escolher o projeto. O Id no fim desempata os relatos do mesmo
        // instante, que sem isso trocariam de lugar entre uma pagina e a seguinte.
        => await Context.Reports
            .Where(report => report.ProjectId == projectId)
            .OrderByDescending(report => report.CreatedAt)
            .ThenByDescending(report => report.Id)
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

    public Task<int> CountByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => Context.Reports
            .Where(report => report.ProjectId == projectId)
            .CountAsync(cancellationToken);

    public Task<Report?> GetByPublicIdWithContextsAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default)
        => Context.Reports
            .Include(report => report.Contexts)
            .FirstOrDefaultAsync(report => report.ProjectId == projectId && report.PublicId == publicId,
                cancellationToken);
}
