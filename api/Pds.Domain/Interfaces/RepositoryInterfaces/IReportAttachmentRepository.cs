using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>Os arquivos que vieram com um relato.</summary>
public interface IReportAttachmentRepository : IBaseRepository<ReportAttachment>
{
    /// <summary>
    /// Quantos anexos <b>confirmados</b> um envio ja tem, por tipo e no total.
    ///
    /// <para><b>O envio e a criacao do relato ou uma resposta, e cada um tem a sua
    /// cota.</b> Com uma cota so para o relato, quem mandou quatro prints ao relatar
    /// nao conseguiria responder com o print que o time pediu — que e o caso que o
    /// anexo na resposta existe para atender. <paramref name="publicCommentId"/>
    /// nulo e a criacao.</para>
    ///
    /// <para><b>So os confirmados contam.</b> O que ficou pendente e permissao que
    /// alguem pediu e nao usou — faze-lo ocupar vaga deixaria quem tentou tres vezes
    /// e falhou sem conseguir anexar nada.</para>
    ///
    /// <para>Sem sessao: quem anexa e quem relatou, e la a conta atual e zero.</para>
    /// </summary>
    Task<(int Total, int OfKind)> CountConfirmedWithoutSessionAsync(
        long reportId,
        long? publicCommentId,
        MediaKindEnum kind,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// O anexo <b>pendente</b> daquele relato, para confirmar.
    ///
    /// <para>O relato entra na consulta, e nao so o identificador do anexo: sem ele,
    /// quem tivesse o identificador de um anexo alheio confirmaria o anexo de
    /// outra pessoa.</para>
    /// </summary>
    Task<ReportAttachment?> FindPendingWithoutSessionAsync(
        Guid publicId,
        long reportId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Os anexos confirmados de um relato, <b>com sessao</b>, na ordem em que
    /// entraram. O filtro global limita a conta do painel — relato de outra conta
    /// nao traz nada.
    /// </summary>
    Task<List<ReportAttachment>> ListConfirmedAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>Os anexos confirmados de um relato, sem sessao, na ordem em que entraram.</summary>
    Task<List<ReportAttachment>> ListConfirmedWithoutSessionAsync(
        long reportId,
        CancellationToken cancellationToken = default);
}
