using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface ICardLinkRepository : IBaseRepository<CardLink>
{
    /// <summary>Os vinculos de um card, nas duas direcoes, com os dois cards carregados.</summary>
    Task<IReadOnlyList<CardLink>> ListByCardAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>O vinculo de um card pelo identificador publico, rastreado.</summary>
    Task<CardLink?> FindByPublicIdAsync(long reportId, Guid linkPublicId, CancellationToken cancellationToken = default);

    /// <summary>O vinculo entre dois cards, em qualquer direcao.</summary>
    Task<CardLink?> FindBetweenAsync(long reportId, long otherId, CancellationToken cancellationToken = default);

    /// <summary>
    /// O vinculo "duplicado de" que sai deste card, rastreado e com o original
    /// carregado. Sem sessao: quem relatou reabre ou responde pela pagina.
    /// </summary>
    Task<CardLink?> FindOriginalLinkWithoutSessionAsync(long duplicateId, CancellationToken cancellationToken = default);

    /// <summary>Os vinculos "duplicado de" que chegam a este original, rastreados e com o duplicado carregado.</summary>
    Task<List<CardLink>> ListDuplicateLinksAsync(long originalId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os relatos duplicados deste original, rastreados. Sem sessao: a etapa do
    /// original tambem anda pela fila e pela pagina de acompanhamento.
    /// </summary>
    Task<List<Report>> ListDuplicateReportsWithoutSessionAsync(long originalId, CancellationToken cancellationToken = default);
}
