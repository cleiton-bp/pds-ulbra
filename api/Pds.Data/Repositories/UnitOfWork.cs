using Pds.ApiBase;
using Pds.Data.Context;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

/// <summary>
/// Cria os repositorios sob demanda, todos sobre o mesmo <see cref="DataContext"/>,
/// e confirma tudo de uma vez no <c>CommitAsync</c>.
/// </summary>
public class UnitOfWork : BaseUnitOfWork, IUnitOfWork
{
    private readonly DataContext _context;

    public UnitOfWork(DataContext context) : base(context)
    {
        _context = context;
    }

    private IAccountRepository? _accounts;
    public IAccountRepository Accounts => _accounts ??= new AccountRepository(_context);

    private IUserRepository? _users;
    public IUserRepository Users => _users ??= new UserRepository(_context);

    private IProjectRepository? _projects;
    public IProjectRepository Projects => _projects ??= new ProjectRepository(_context);

    private IProjectKeyRepository? _projectKeys;
    public IProjectKeyRepository ProjectKeys => _projectKeys ??= new ProjectKeyRepository(_context);
}
