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
}
