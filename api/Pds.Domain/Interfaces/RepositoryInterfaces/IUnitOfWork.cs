using Pds.ApiBase.Interfaces;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>
/// Reune os repositorios e confirma tudo numa unica gravacao. E o que permite
/// criar o projeto e as duas chaves de uma vez: ou entra tudo, ou nao entra nada.
/// </summary>
public interface IUnitOfWork : IBaseUnitOfWork
{
    IAccountRepository Accounts { get; }
    IUserRepository Users { get; }
    IProjectRepository Projects { get; }
    IProjectKeyRepository ProjectKeys { get; }
}
