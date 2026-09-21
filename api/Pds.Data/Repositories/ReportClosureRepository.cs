using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ReportClosureRepository : BaseRepository<ReportClosure, DataContext>, IReportClosureRepository
{
    public ReportClosureRepository(DataContext context) : base(context)
    {
    }

    public Task<ReportClosure?> FindCurrentWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a da conta — o mesmo
        // desenho da jornada publica e da chave publica.
        //
        // `ReopenedAt == null` esta na **consulta**, e nao numa conferencia depois:
        // o fechamento reaberto nunca chega a sair daqui, entao nao ha como ele
        // aparecer na pagina por alguem ter esquecido de olhar a coluna.
        => Context.ReportClosures
            .IgnoreQueryFilters()
            .Where(closure => closure.ReportId == reportId
                              && closure.DeletedAt == null
                              && closure.Report.DeletedAt == null
                              && closure.ReopenedAt == null)
            .OrderByDescending(closure => closure.ClosedAt)
            .ThenByDescending(closure => closure.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public Task<ReportClosure?> FindPublicWithoutSessionAsync(long reportId, DateTime asOf, CancellationToken cancellationToken = default)
        // As mesmas condicoes da consulta acima, mais a data de valer la fora. Ela
        // esta na **consulta**, e nao numa conferencia depois: o fechamento que
        // ainda nao vale nunca chega a sair daqui, entao nao ha como ele aparecer na
        // pagina por alguem ter esquecido de olhar a coluna.
        => Context.ReportClosures
            .IgnoreQueryFilters()
            .Where(closure => closure.ReportId == reportId
                              && closure.DeletedAt == null
                              && closure.Report.DeletedAt == null
                              && closure.ReopenedAt == null
                              && closure.PublicAt <= asOf)
            .OrderByDescending(closure => closure.ClosedAt)
            .ThenByDescending(closure => closure.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<long>> ListReportIdsWithPublicClosureWithoutSessionAsync(IReadOnlyList<long> reportIds, DateTime asOf, CancellationToken cancellationToken = default)
    {
        // Lista vazia nao vira consulta: `IN ()` nao existe em SQL, e perguntar por
        // nada custaria uma ida ao banco para receber nada.
        if (reportIds.Count == 0)
            return [];

        // As mesmas condicoes da consulta de cima, para o conjunto inteiro. So o
        // identificador volta: quem chama quer saber **quais** acabaram, e carregar
        // os fechamentos inteiros traria motivo e desfecho que esta lista nao mostra.
        return await Context.ReportClosures
            .IgnoreQueryFilters()
            .Where(closure => reportIds.Contains(closure.ReportId)
                              && closure.DeletedAt == null
                              && closure.Report.DeletedAt == null
                              && closure.ReopenedAt == null
                              && closure.PublicAt <= asOf)
            .Select(closure => closure.ReportId)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    public Task<ReportClosure?> FindCurrentAsync(long reportId, CancellationToken cancellationToken = default)
        // O filtro global vale aqui, e e o que isola a conta. O `Include` do autor
        // so existe nesta: quem relatou nao ve o nome de quem encerrou, e nao
        // carregar e mais seguro do que carregar e confiar em nao usar.
        => Context.ReportClosures
            .Include(closure => closure.ClosedByUser)
            .Where(closure => closure.ReportId == reportId && closure.ReopenedAt == null)
            .OrderByDescending(closure => closure.ClosedAt)
            .ThenByDescending(closure => closure.Id)
            .FirstOrDefaultAsync(cancellationToken);
}
