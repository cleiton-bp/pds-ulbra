using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ReportInfoRequestRepository
    : BaseRepository<ReportInfoRequest, DataContext>, IReportInfoRequestRepository
{
    public ReportInfoRequestRepository(DataContext context) : base(context)
    {
    }

    public Task<ReportInfoRequest?> FindOpenAsync(long reportId, CancellationToken cancellationToken = default)
        => Context.ReportInfoRequests
            .Where(request => request.ReportId == reportId
                              && request.AnsweredAt == null
                              && request.ExpiredAt == null)
            .OrderByDescending(request => request.AskedAt)
            .ThenByDescending(request => request.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public Task<ReportInfoRequest?> FindOpenWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a da conta.
        => Context.ReportInfoRequests
            .IgnoreQueryFilters()
            .Where(request => request.ReportId == reportId
                              && request.AnsweredAt == null
                              && request.ExpiredAt == null
                              && request.DeletedAt == null
                              && request.Report.DeletedAt == null)
            .OrderByDescending(request => request.AskedAt)
            .ThenByDescending(request => request.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<Guid>> ListOverdueWithoutSessionAsync(DateTime now, CancellationToken cancellationToken = default)
        => await Context.ReportInfoRequests
            .IgnoreQueryFilters()
            .Where(request => request.AnsweredAt == null
                              && request.ExpiredAt == null
                              && request.DeletedAt == null
                              && request.CloseAt <= now)
            .OrderBy(request => request.CloseAt)
            .Select(request => request.Report.PublicId)
            .ToListAsync(cancellationToken);
}
