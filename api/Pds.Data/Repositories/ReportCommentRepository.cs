using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

/// <summary>
/// Os dois repositorios de comentario, lado a lado neste arquivo justamente para
/// quem mexer num ver o outro — e nao para compartilharem codigo. Eles nao tem
/// base comum: ver <see cref="IReportInternalCommentRepository"/>.
/// </summary>
public class ReportInternalCommentRepository
    : BaseRepository<ReportInternalComment, DataContext>, IReportInternalCommentRepository
{
    public ReportInternalCommentRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ReportInternalComment>> ListByReportAsync(long reportId, CancellationToken cancellationToken = default)
        // Do mais antigo para o mais novo: comentario e conversa, e conversa se le
        // na ordem em que aconteceu. O Id desempata os do mesmo instante.
        => await Context.ReportInternalComments
            .Include(comment => comment.User)
            .Where(comment => comment.ReportId == reportId)
            .OrderBy(comment => comment.CreatedAt)
            .ThenBy(comment => comment.Id)
            .ToListAsync(cancellationToken);
}

public class ReportPublicCommentRepository
    : BaseRepository<ReportPublicComment, DataContext>, IReportPublicCommentRepository
{
    public ReportPublicCommentRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ReportPublicComment>> ListByReportAsync(long reportId, CancellationToken cancellationToken = default)
        => await Context.ReportPublicComments
            .Include(comment => comment.User)
            .Where(comment => comment.ReportId == reportId)
            .OrderBy(comment => comment.CreatedAt)
            .ThenBy(comment => comment.Id)
            .ToListAsync(cancellationToken);
}
