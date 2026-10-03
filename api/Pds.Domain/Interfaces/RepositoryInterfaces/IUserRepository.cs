using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IUserRepository : IBaseRepository<User>
{
    /// <summary>
    /// Busca o usuario pelo <c>sub</c> do Google, trazendo a conta junto. E a
    /// consulta do login: e o unico ponto do sistema que procura usuario sem saber
    /// ainda a qual conta ele pertence.
    /// </summary>
    Task<User?> GetByGoogleSubjectAsync(string googleSubject, CancellationToken cancellationToken = default);

    /// <summary>
    /// As pessoas de uma conta — quem e dono de todos os projetos dela. Usuario nao
    /// tem filtro de acesso: quem chama ja conferiu que enxerga o projeto da conta.
    /// </summary>
    Task<IReadOnlyList<User>> ListByAccountAsync(long accountId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<User>> ListByPublicIdsAsync(IReadOnlyCollection<Guid> publicIds, CancellationToken cancellationToken = default);
}
