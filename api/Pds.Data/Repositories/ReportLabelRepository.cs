using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ReportLabelRepository : BaseRepository<ReportLabel, DataContext>, IReportLabelRepository
{
    public ReportLabelRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ReportLabel>> ListByLabelAsync(long projectLabelId, CancellationToken cancellationToken = default)
        => await Context.ReportLabels
            .Where(link => link.ProjectLabelId == projectLabelId)
            .ToListAsync(cancellationToken);
}
