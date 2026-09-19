using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

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
}

/// <summary>Os comentarios que o time escreveu para quem relatou.</summary>
public interface IReportPublicCommentRepository : IBaseRepository<ReportPublicComment>
{
    /// <summary>Os publicos do relato, do mais antigo para o mais novo.</summary>
    Task<IReadOnlyList<ReportPublicComment>> ListByReportAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os mesmos, para quem chega <b>sem sessao</b>: a pagina de acompanhamento.
    ///
    /// <para><b>Sem o autor carregado</b>, e de proposito. Quem relatou nao ve o
    /// nome de ninguem do time, e nao carregar e mais seguro do que carregar e
    /// confiar em nao usar — a resposta publica e montada campo a campo, mas o
    /// campo que nao existe nao tem como escapar.</para>
    /// </summary>
    Task<IReadOnlyList<ReportPublicComment>> ListByReportWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default);
}
