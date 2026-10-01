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
    /// <summary>O espaco das travas da cota de anexos. Arbitrario; so precisa nao mudar.</summary>
    private const int UploadQuotaLockSpace = 7001;

    public ReportAttachmentRepository(DataContext context) : base(context)
    {
    }

    public async Task<(int Total, int OfKind)> CountConfirmedWithoutSessionAsync(
        long reportId,
        long? publicCommentId,
        long? reopenedClosureId,
        MediaKindEnum kind,
        CancellationToken cancellationToken = default)
    {
        // Uma consulta para os dois numeros, para o total e o do tipo serem lidos no
        // mesmo instante. Isso nao segura dois envios ao mesmo tempo — quem segura e
        // a trava de LockUploadQuotaAsync, na confirmacao.
        var confirmados = await Confirmados(reportId)
            // As duas colunas, e nao so a do envio pedido: com uma so, a criacao
            // (as duas nulas) contaria tambem os arquivos das reaberturas.
            .Where(attachment => attachment.PublicCommentId == publicCommentId
                                 && attachment.ReopenedClosureId == reopenedClosureId)
            .Select(attachment => attachment.Kind)
            .ToListAsync(cancellationToken);

        return (confirmados.Count, confirmados.Count(atual => atual == kind));
    }

    public Task LockUploadQuotaAsync(long reportId, CancellationToken cancellationToken = default)
    {
        // Fora de uma transacao, o banco solta a trava no fim deste proprio comando:
        // a chamada "funcionaria" e nao travaria nada. Melhor quebrar alto.
        if (Context.Database.CurrentTransaction is null)
            throw new InvalidOperationException("A trava da cota de anexos so vale dentro de uma transacao.");

        // Trava consultiva, e nao FOR UPDATE na linha do relato: a da linha tambem
        // seguraria quem so quer mexer no relato — o time movendo o card, a pessoa
        // respondendo —, e esta so espera por outra confirmacao de anexo do mesmo
        // relato. O par (espaco, relato) evita cruzar com outra trava que um dia use
        // o mesmo numero; relatos que coincidam no corte para int so esperam um pelo
        // outro, sem erro.
        var relato = unchecked((int)reportId);

        return Context.Database.ExecuteSqlAsync(
            $"SELECT pg_advisory_xact_lock({UploadQuotaLockSpace}, {relato})",
            cancellationToken);
    }

    public Task<bool> IsObjectKeyInUseWithoutSessionAsync(string objectKey, CancellationToken cancellationToken = default)
        => Context.ReportAttachments
            .IgnoreQueryFilters()
            .AsNoTracking()
            .AnyAsync(attachment => attachment.ObjectKey == objectKey && attachment.DeletedAt == null,
                cancellationToken);

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

    public Task<ReportAttachment?> FindConfirmedWithoutSessionAsync(
        Guid publicId,
        long reportId,
        CancellationToken cancellationToken = default)
        => Confirmados(reportId)
            .AsNoTracking()
            .FirstOrDefaultAsync(attachment => attachment.PublicId == publicId, cancellationToken);

    public Task<bool> HasActivitySinceWithoutSessionAsync(
        long reportId,
        long? publicCommentId,
        long? reopenedClosureId,
        DateTime since,
        CancellationToken cancellationToken = default)
        // Sem filtrar o apagado: o descartado tambem foi o envio andando. A
        // confirmacao e o descarte gravam UpdatedAt — e a hora em que o arquivo
        // terminou.
        => Context.ReportAttachments
            .IgnoreQueryFilters()
            .AnyAsync(attachment => attachment.ReportId == reportId
                                    && attachment.PublicCommentId == publicCommentId
                                    && attachment.ReopenedClosureId == reopenedClosureId
                                    && (attachment.CreatedAt >= since || attachment.UpdatedAt >= since),
                cancellationToken);

    public Task<List<ReportAttachment>> ListConfirmedAsync(long reportId, CancellationToken cancellationToken = default)
        // Com o filtro global, que ja carrega a conta: e o que faz o painel de uma
        // conta nunca assinar leitura de arquivo de outra.
        => Context.ReportAttachments
            .Include(attachment => attachment.PublicComment)
            .Include(attachment => attachment.ReopenedClosure)
            .Where(attachment => attachment.ReportId == reportId
                                 && attachment.Status == AttachmentStatusEnum.Confirmed)
            // A ordem da montagem, e nao a da chegada: o arquivo tentado de novo chega
            // depois dos outros. Ver DisplayOrder. A posicao vale dentro de um envio, e
            // a tela separa os envios; a hora desempata, e desempata os de antes da
            // coluna, que ficaram todos em zero.
            .OrderBy(attachment => attachment.DisplayOrder)
            .ThenBy(attachment => attachment.CreatedAt)
            .ThenBy(attachment => attachment.Id)
            .ToListAsync(cancellationToken);

    public Task<List<ReportAttachment>> ListConfirmedWithoutSessionAsync(
        long reportId,
        CancellationToken cancellationToken = default)
        => Confirmados(reportId)
            .Include(attachment => attachment.PublicComment)
            .Include(attachment => attachment.ReopenedClosure)
            // A mesma ordem do painel: ver ListConfirmedAsync.
            .OrderBy(attachment => attachment.DisplayOrder)
            .ThenBy(attachment => attachment.CreatedAt)
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
