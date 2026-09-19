using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>Os pedidos de informacao de um relato.</summary>
public interface IReportInfoRequestRepository : IBaseRepository<ReportInfoRequest>
{
    /// <summary>
    /// O pedido que ainda espera resposta, ou <b>nulo</b> quando nao ha nenhum.
    ///
    /// <para>Aberto quer dizer sem resposta e sem vencimento. A condicao esta na
    /// <b>consulta</b>, e nao numa conferencia depois: pedido ja respondido nunca
    /// chega a sair daqui, entao nao ha como ele reaparecer na tela por alguem ter
    /// esquecido de olhar as colunas.</para>
    /// </summary>
    Task<ReportInfoRequest?> FindOpenAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>O mesmo, para quem chega <b>sem sessao</b>: a pagina de acompanhamento.</summary>
    Task<ReportInfoRequest?> FindOpenWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os pedidos cujo prazo venceu e ninguem encerrou.
    ///
    /// <para>A mesma rede da espera: roda na subida da aplicacao, porque o que
    /// aguarda dentro do broker nao e replicado. Devolve identificadores publicos
    /// de <b>relato</b>, que e o que o consumidor sabe tratar.</para>
    /// </summary>
    Task<IReadOnlyList<Guid>> ListOverdueWithoutSessionAsync(DateTime now, CancellationToken cancellationToken = default);
}
