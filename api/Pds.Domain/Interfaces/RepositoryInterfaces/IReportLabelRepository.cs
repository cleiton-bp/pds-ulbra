using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IReportLabelRepository : IBaseRepository<ReportLabel>
{
    Task<IReadOnlyList<ReportLabel>> ListByLabelAsync(long projectLabelId, CancellationToken cancellationToken = default);
}
