using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>
/// Um pedaco da conversa: as mensagens, da mais antiga para a mais nova, e se ha mais antigas
/// do que elas. E o que o chat do card carrega aos poucos, ao subir.
/// </summary>
public record CommentPage<T>(IReadOnlyList<T> Items, bool HasOlder);

/// <summary>
/// Os comentarios internos de um relato.
///
/// <para><b>Nao ha interface comum com o publico, e e de proposito.</b> Uma base
/// compartilhada convidaria a escrever uma consulta generica "comentarios do
/// relato" — e essa consulta e exatamente o vazamento que as duas tabelas
/// existem para tornar impossivel.</para>
/// </summary>
public interface IReportInternalCommentRepository : IBaseRepository<ReportInternalComment>
{
    /// <summary>Os internos do relato, do mais antigo para o mais novo.</summary>
    Task<IReadOnlyList<ReportInternalComment>> ListByReportAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>Os <paramref name="limit"/> internos mais recentes do relato.</summary>
    Task<CommentPage<ReportInternalComment>> ListLatestAsync(long reportId, int limit, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os <paramref name="limit"/> internos anteriores a <paramref name="beforePublicId"/>. Nulo
    /// quando essa mensagem nao e deste relato.
    /// </summary>
    Task<CommentPage<ReportInternalComment>?> ListBeforeAsync(long reportId, Guid beforePublicId, int limit, CancellationToken cancellationToken = default);

    /// <summary>Um interno deste relato, com quem escreveu e a mensagem que ele responde, ou nulo.</summary>
    Task<ReportInternalComment?> FindInReportAsync(long reportId, Guid publicId, CancellationToken cancellationToken = default);
}

/// <summary>Os comentarios que o time escreveu para quem relatou.</summary>
public interface IReportPublicCommentRepository : IBaseRepository<ReportPublicComment>
{
    /// <summary>Os publicos do relato, do mais antigo para o mais novo.</summary>
    Task<IReadOnlyList<ReportPublicComment>> ListByReportAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>Os <paramref name="limit"/> publicos mais recentes do relato.</summary>
    Task<CommentPage<ReportPublicComment>> ListLatestAsync(long reportId, int limit, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os <paramref name="limit"/> publicos anteriores a <paramref name="beforePublicId"/>. Nulo
    /// quando essa mensagem nao e deste relato.
    /// </summary>
    Task<CommentPage<ReportPublicComment>?> ListBeforeAsync(long reportId, Guid beforePublicId, int limit, CancellationToken cancellationToken = default);

    /// <summary>Um publico deste relato, com quem escreveu e a mensagem que ele responde, ou nulo.</summary>
    Task<ReportPublicComment?> FindInReportAsync(long reportId, Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os mesmos, para quem chega <b>sem sessao</b>: a pagina de acompanhamento.
    ///
    /// <para><b>Sem o autor carregado</b>, e de proposito. Quem relatou nao ve o
    /// nome de ninguem do time, e nao carregar e mais seguro do que carregar e
    /// confiar em nao usar — a resposta publica e montada campo a campo, mas o
    /// campo que nao existe nao tem como escapar.</para>
    /// </summary>
    Task<IReadOnlyList<ReportPublicComment>> ListByReportWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A resposta mais recente de quem relatou, se ela foi escrita depois de
    /// <paramref name="since"/>. Sem sessao: quem pergunta e a propria pessoa, pelo
    /// link.
    ///
    /// <para>E a ancora do anexo na resposta. O arquivo sobe <b>depois</b> de a
    /// resposta ser gravada — o texto nunca espera o upload —, e e aqui que ele
    /// descobre a que fala pertence, sem o navegador precisar dizer.</para>
    /// </summary>
    Task<ReportPublicComment?> FindLatestFromReporterWithoutSessionAsync(
        long reportId,
        DateTime since,
        CancellationToken cancellationToken = default);
}
