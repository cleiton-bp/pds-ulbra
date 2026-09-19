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

    public async Task<IReadOnlyList<ReportPublicComment>> ListByReportWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default)
        // Sem `Include` do usuario: quem le isto e a pagina de acompanhamento, e la
        // o nome de quem escreveu do lado de dentro nao aparece. O campo que nao
        // vem do banco nao tem como escapar numa resposta.
        //
        // As condicoes do filtro global reescritas a mao, menos a da conta.
        => await Context.ReportPublicComments
            .IgnoreQueryFilters()
            .Where(comment => comment.ReportId == reportId
                              && comment.DeletedAt == null
                              && comment.Report.DeletedAt == null)
            .OrderBy(comment => comment.CreatedAt)
            .ThenBy(comment => comment.Id)
            .ToListAsync(cancellationToken);
}
