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
    /// <para><b>O envio e a criacao do relato, uma resposta ou uma reabertura, e
    /// cada um tem a sua cota.</b> Com uma cota so para o relato, quem mandou quatro
    /// prints ao relatar nao conseguiria responder com o print que o time pediu, nem
    /// mostrar ao reabrir o que ainda esta quebrado. <paramref name="publicCommentId"/>
    /// e <paramref name="reopenedClosureId"/> nulos juntos sao a criacao; no maximo
    /// um deles vem preenchido.</para>
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
        long? reopenedClosureId,
        MediaKindEnum kind,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Trava a cota de anexos do relato ate a transacao atual terminar.
    ///
    /// <para><b>E ela que faz o limite valer com envios ao mesmo tempo.</b> Contar e
    /// depois confirmar sao dois passos; sem a trava, duas confirmacoes contam juntas,
    /// as duas veem vaga, e as duas entram. Com ela, a segunda so conta depois de a
    /// primeira terminar — e ja a ve.</para>
    ///
    /// <para>So vale dentro de uma transacao (<c>InTransactionAsync</c>); fora dela
    /// o banco soltaria a trava no fim do proprio comando, sem avisar, e por isso a
    /// chamada fora de uma e recusada.</para>
    /// </summary>
    Task LockUploadQuotaAsync(long reportId, CancellationToken cancellationToken = default);

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
