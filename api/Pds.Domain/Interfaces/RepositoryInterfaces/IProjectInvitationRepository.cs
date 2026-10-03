using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectInvitationRepository : IBaseRepository<ProjectInvitation>
{
    /// <summary>Os convites abertos do projeto — nem aceitos, nem cancelados —, com quem convidou.</summary>
    Task<IReadOnlyList<ProjectInvitation>> ListOpenByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>O convite aberto para um endereco, se houver. Convidar de novo reenvia este.</summary>
    Task<ProjectInvitation?> FindOpenByEmailAsync(long projectId, string email, CancellationToken cancellationToken = default);

    /// <summary>
    /// O convite de um link, <b>sem sessao do projeto</b> — quem abre o link ainda
    /// nao esta no time. Volta tambem aceito ou cancelado, para a tela dizer qual.
    /// Com o projeto e quem convidou.
    /// </summary>
    Task<ProjectInvitation?> FindByTokenHashWithoutSessionAsync(string tokenHash, CancellationToken cancellationToken = default);

    /// <summary>
    /// O convite que o consumidor da fila vai mandar, <b>sem sessao</b> e <b>sem
    /// rastreio</b>, com o projeto e quem convidou. Tudo o que o consumidor grava
    /// e condicional, pelos metodos abaixo — nunca a entidade inteira.
    /// </summary>
    Task<ProjectInvitation?> GetForEmailWithoutSessionAsync(Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reserva o convite para o envio e grava o hash do link, numa gravacao so:
    /// de pendente para enviando, <b>se a linha ainda e a que foi lida</b>
    /// (<paramref name="readUpdatedAt"/>). Devolve falso se outro consumidor ja
    /// reservou, se o convite fechou, ou se mudou depois da leitura — um reenvio,
    /// por exemplo, cujo pedido ja esta na fila e manda o e-mail que vale.
    /// </summary>
    Task<bool> TryClaimForSendingWithoutSessionAsync(long invitationId, DateTime readUpdatedAt, string tokenHash, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>
    /// Fecha o envio reservado: enviado ou nao saiu — <b>so se a linha continua
    /// "enviando", com o hash deste envio</b>. Um reenvio no meio poe o convite de
    /// novo na fila, sem hash; ai este envio nao grava nada, e quem vale e o proximo.
    /// Devolve se gravou.
    /// </summary>
    Task<bool> FinishSendingWithoutSessionAsync(long invitationId, string tokenHash, bool sent, string? error, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>
    /// Marca como "nao saiu" o convite que nem chegou a ser reservado — vencido, ou
    /// sem e-mail neste servidor —, se a linha ainda e a que foi lida.
    /// </summary>
    Task<bool> FailPendingWithoutSessionAsync(long invitationId, DateTime readUpdatedAt, string error, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>Os convites abertos ainda na fila, para a subida mandar de novo.</summary>
    Task<IReadOnlyList<Guid>> ListPendingEmailWithoutSessionAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Os que ficaram presos no meio do envio desde antes de um momento — uma queda
    /// no meio — passam a falha, e a tela oferece reenviar.
    /// </summary>
    Task<int> FailStuckSendingWithoutSessionAsync(DateTime attemptedBefore, string error, CancellationToken cancellationToken = default);
}
