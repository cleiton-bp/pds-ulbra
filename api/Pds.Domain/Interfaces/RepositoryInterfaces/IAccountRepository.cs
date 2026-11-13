using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;
using Pds.Domain.Filters;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IAccountRepository : IBaseRepository<Account>
{
    /// <summary>
    /// A conta, mesmo no prazo de exclusao ou ja excluida. **Sem o filtro global**: a conta
    /// que pediu exclusao tem <c>DeletedAt</c> preenchido, e o filtro a esconderia justo de
    /// quem precisa decidir o que fazer com ela (o login e a limpeza). Rastreada.
    /// </summary>
    Task<Account?> FindWithoutSessionAsync(long id, CancellationToken cancellationToken = default);

    /// <summary>A mesma, pelo identificador publico, que e o que viaja na fila.</summary>
    Task<Account?> FindByPublicIdWithoutSessionAsync(Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>As contas com o prazo vencido e a limpeza por fazer.</summary>
    Task<IReadOnlyList<Guid>> ListOverduePurgesWithoutSessionAsync(DateTime now, CancellationToken cancellationToken = default);

    /// <summary>O que a exclusao leva, para o dialogo: projetos, relatos, time de fora e outros times da pessoa.</summary>
    Task<AccountDeletionCounts> CountForDeletionAsync(long accountId, long userId, CancellationToken cancellationToken = default);

    /// <summary>Os projetos da conta ainda no ar, cada um com as pessoas de fora do time, para avisar em tempo real.</summary>
    Task<IReadOnlyList<ProjectTeamToNotify>> ListTeamsToNotifyAsync(long accountId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Tira do ar, de uma vez, os projetos da conta ainda no ar, com o instante do pedido.
    /// **O instante e a marca do desfazer**: so os projetos com exatamente esse
    /// <c>DeletedAt</c> voltam no cancelamento. Executa na hora, entao vale chamar dentro de
    /// uma transacao.
    /// </summary>
    Task TakeProjectsOfflineAsync(long accountId, DateTime at, CancellationToken cancellationToken = default);

    /// <summary>Devolve os projetos que o pedido de exclusao tirou do ar (os com <c>DeletedAt</c> igual a <paramref name="at"/>).</summary>
    Task BringProjectsBackAsync(long accountId, DateTime at, CancellationToken cancellationToken = default);

    /// <summary>Todos os projetos da conta, os fora do ar inclusive, para a limpeza.</summary>
    Task<IReadOnlyList<long>> ListProjectIdsWithoutSessionAsync(long accountId, CancellationToken cancellationToken = default);

    /// <summary>Todos os relatos e cards de um projeto, os apagados inclusive, para a limpeza.</summary>
    Task<IReadOnlyList<long>> ListReportIdsWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Apaga de vez os projetos, depois que os relatos deles ja sairam. Leva antes o que
    /// segura o projeto sem cascata no banco (avisos do sino, vinculos e sprints); o resto
    /// sai pela cascata.
    /// </summary>
    Task DeleteProjectsAsync(IReadOnlyCollection<long> projectIds, CancellationToken cancellationToken = default);

    /// <summary>
    /// Tira da conta e das pessoas dela o que identifica alguem: nome, e-mail, foto e o
    /// identificador do Google, que deixaria a conta ser reencontrada num login futuro. A
    /// pessoa sai dos times de outras contas, perde os avisos e os sons, e o que escreveu
    /// nesses projetos fica com o nome de pessoa removida. Os eventos da conta ficam, sem o
    /// caminho da pagina, que e o unico campo que pode carregar algo de alguem.
    /// </summary>
    Task AnonymizeAsync(long accountId, DateTime at, CancellationToken cancellationToken = default);
}
