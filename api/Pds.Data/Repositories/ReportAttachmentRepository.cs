using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ReportAttachmentRepository
    : BaseRepository<ReportAttachment, DataContext>, IReportAttachmentRepository
{
    public ReportAttachmentRepository(DataContext context) : base(context)
    {
    }

    public async Task<(int Total, int OfKind)> CountConfirmedWithoutSessionAsync(
        long reportId,
        long? publicCommentId,
        MediaKindEnum kind,
        CancellationToken cancellationToken = default)
    {
        // Uma consulta para os dois numeros. Duas fariam o total e o do tipo serem
        // lidos em momentos diferentes, e dois envios ao mesmo tempo passariam pela
        // fresta entre elas.
        var confirmados = await Confirmados(reportId)
            .Where(attachment => attachment.PublicCommentId == publicCommentId)
            .Select(attachment => attachment.Kind)
            .ToListAsync(cancellationToken);

        return (confirmados.Count, confirmados.Count(atual => atual == kind));
    }

    public Task<ReportAttachment?> FindPendingWithoutSessionAsync(
        Guid publicId,
        long reportId,
        CancellationToken cancellationToken = default)
        => Context.ReportAttachments
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(attachment => attachment.PublicId == publicId
                                               && attachment.ReportId == reportId
                                               && attachment.Status == AttachmentStatusEnum.Pending
                                               && attachment.DeletedAt == null
                                               && attachment.Report.DeletedAt == null,
                cancellationToken);

    public Task<List<ReportAttachment>> ListConfirmedAsync(long reportId, CancellationToken cancellationToken = default)
        // Com o filtro global, que ja carrega a conta: e o que faz o painel de uma
        // conta nunca assinar leitura de arquivo de outra.
        => Context.ReportAttachments
            .Include(attachment => attachment.PublicComment)
            .Where(attachment => attachment.ReportId == reportId
                                 && attachment.Status == AttachmentStatusEnum.Confirmed)
            .OrderBy(attachment => attachment.CreatedAt)
            .ThenBy(attachment => attachment.Id)
            .ToListAsync(cancellationToken);

    public Task<List<ReportAttachment>> ListConfirmedWithoutSessionAsync(
        long reportId,
        CancellationToken cancellationToken = default)
        => Confirmados(reportId)
            .Include(attachment => attachment.PublicComment)
            .OrderBy(attachment => attachment.CreatedAt)
            .ThenBy(attachment => attachment.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// As condicoes do filtro global reescritas a mao, menos a da conta — o mesmo
    /// desenho das demais leituras publicas.
    /// </summary>
    private IQueryable<ReportAttachment> Confirmados(long reportId)
        => Context.ReportAttachments
            .IgnoreQueryFilters()
            .Where(attachment => attachment.ReportId == reportId
                                 && attachment.Status == AttachmentStatusEnum.Confirmed
                                 && attachment.DeletedAt == null
                                 && attachment.Report.DeletedAt == null);
}
