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
        => await DoRelato(reportId)
            .OrderBy(comment => comment.CreatedAt)
            .ThenBy(comment => comment.Id)
            .ToListAsync(cancellationToken);

    public async Task<CommentPage<ReportInternalComment>> ListLatestAsync(long reportId, int limit, CancellationToken cancellationToken = default)
        => Pagina(await DoRelato(reportId)
            .OrderByDescending(comment => comment.CreatedAt)
            .ThenByDescending(comment => comment.Id)
            .Take(limit + 1)
            .ToListAsync(cancellationToken), limit);

    public async Task<CommentPage<ReportInternalComment>?> ListBeforeAsync(long reportId, Guid beforePublicId, int limit, CancellationToken cancellationToken = default)
    {
        // A posicao da mensagem de referencia, mesmo se ela foi apagada depois de a tela
        // carregar: o relato ja foi conferido por quem chama, e daqui so sai a posicao.
        var ponto = await Context.ReportInternalComments
            .IgnoreQueryFilters()
            .Where(comment => comment.ReportId == reportId && comment.PublicId == beforePublicId)
            .Select(comment => new { comment.CreatedAt, comment.Id })
            .FirstOrDefaultAsync(cancellationToken);

        if (ponto is null)
            return null;

        // Pela posicao (data e Id), e nao por pular N: chegando mensagem nova enquanto a
        // pessoa sobe a conversa, pular N repetiria ou perderia mensagens.
        return Pagina(await DoRelato(reportId)
            .Where(comment => comment.CreatedAt < ponto.CreatedAt
                              || (comment.CreatedAt == ponto.CreatedAt && comment.Id < ponto.Id))
            .OrderByDescending(comment => comment.CreatedAt)
            .ThenByDescending(comment => comment.Id)
            .Take(limit + 1)
            .ToListAsync(cancellationToken), limit);
    }

    public Task<ReportInternalComment?> FindInReportAsync(long reportId, Guid publicId, CancellationToken cancellationToken = default)
        => DoRelato(reportId).FirstOrDefaultAsync(comment => comment.PublicId == publicId, cancellationToken);

    /// <summary>Os internos do relato com quem escreveu e a mensagem citada (e quem a escreveu).</summary>
    private IQueryable<ReportInternalComment> DoRelato(long reportId)
        => Context.ReportInternalComments
            .Include(comment => comment.User)
            .Include(comment => comment.ReplyTo)
            .ThenInclude(original => original!.User)
            .Where(comment => comment.ReportId == reportId);

    /// <summary>Do mais novo para o mais antigo, com um a mais: vira o pedaco, na ordem da conversa.</summary>
    internal static CommentPage<T> Pagina<T>(List<T> doMaisNovo, int limit)
    {
        var temMais = doMaisNovo.Count > limit;
        var pedaco = doMaisNovo.Take(limit).Reverse().ToList();
        return new CommentPage<T>(pedaco, temMais);
    }
}

public class ReportPublicCommentRepository
    : BaseRepository<ReportPublicComment, DataContext>, IReportPublicCommentRepository
{
    public ReportPublicCommentRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ReportPublicComment>> ListByReportAsync(long reportId, CancellationToken cancellationToken = default)
        => await DoRelato(reportId)
            .OrderBy(comment => comment.CreatedAt)
            .ThenBy(comment => comment.Id)
            .ToListAsync(cancellationToken);

    public async Task<CommentPage<ReportPublicComment>> ListLatestAsync(long reportId, int limit, CancellationToken cancellationToken = default)
        => ReportInternalCommentRepository.Pagina(await DoRelato(reportId)
            .OrderByDescending(comment => comment.CreatedAt)
            .ThenByDescending(comment => comment.Id)
            .Take(limit + 1)
            .ToListAsync(cancellationToken), limit);

    public async Task<CommentPage<ReportPublicComment>?> ListBeforeAsync(long reportId, Guid beforePublicId, int limit, CancellationToken cancellationToken = default)
    {
        // A mesma regra do interno: a posicao da mensagem de referencia, e a pagina por ela.
        var ponto = await Context.ReportPublicComments
            .IgnoreQueryFilters()
            .Where(comment => comment.ReportId == reportId && comment.PublicId == beforePublicId)
            .Select(comment => new { comment.CreatedAt, comment.Id })
            .FirstOrDefaultAsync(cancellationToken);

        if (ponto is null)
            return null;

        return ReportInternalCommentRepository.Pagina(await DoRelato(reportId)
            .Where(comment => comment.CreatedAt < ponto.CreatedAt
                              || (comment.CreatedAt == ponto.CreatedAt && comment.Id < ponto.Id))
            .OrderByDescending(comment => comment.CreatedAt)
            .ThenByDescending(comment => comment.Id)
            .Take(limit + 1)
            .ToListAsync(cancellationToken), limit);
    }

    public Task<ReportPublicComment?> FindInReportAsync(long reportId, Guid publicId, CancellationToken cancellationToken = default)
        => DoRelato(reportId).FirstOrDefaultAsync(comment => comment.PublicId == publicId, cancellationToken);

    /// <summary>Os publicos do relato com quem escreveu e a mensagem citada (e quem a escreveu).</summary>
    private IQueryable<ReportPublicComment> DoRelato(long reportId)
        => Context.ReportPublicComments
            .Include(comment => comment.User)
            .Include(comment => comment.ReplyTo)
            .ThenInclude(original => original!.User)
            .Where(comment => comment.ReportId == reportId);

    public async Task<IReadOnlyList<ReportPublicComment>> ListByReportWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default)
        // Sem `Include` do usuario: quem le isto e a pagina de acompanhamento, e la
        // o nome de quem escreveu do lado de dentro nao aparece. O campo que nao
        // vem do banco nao tem como escapar numa resposta.
        //
        // As condicoes do filtro global reescritas a mao, menos a do acesso.
        => await Context.ReportPublicComments
            .IgnoreQueryFilters()
            .Where(comment => comment.ReportId == reportId
                              && comment.DeletedAt == null
                              && comment.Report.DeletedAt == null)
            .OrderBy(comment => comment.CreatedAt)
            .ThenBy(comment => comment.Id)
            .ToListAsync(cancellationToken);

    public Task<ReportPublicComment?> FindLatestFromReporterWithoutSessionAsync(
        long reportId,
        DateTime since,
        CancellationToken cancellationToken = default)
        // A fala de quem relatou e a que nao tem usuario. As condicoes do filtro
        // global reescritas a mao, menos a do acesso.
        => Context.ReportPublicComments
            .IgnoreQueryFilters()
            .Where(comment => comment.ReportId == reportId
                              && comment.UserId == null
                              && comment.CreatedAt >= since
                              && comment.DeletedAt == null
                              && comment.Report.DeletedAt == null)
            .OrderByDescending(comment => comment.CreatedAt)
            .ThenByDescending(comment => comment.Id)
            .FirstOrDefaultAsync(cancellationToken);

}
