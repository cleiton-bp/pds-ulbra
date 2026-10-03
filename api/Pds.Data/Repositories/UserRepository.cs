using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class UserRepository : BaseRepository<User, DataContext>, IUserRepository
{
    public UserRepository(DataContext context) : base(context)
    {
    }

    public Task<User?> GetByGoogleSubjectAsync(string googleSubject, CancellationToken cancellationToken = default)
        => Context.Users
            .Include(user => user.Account)
            .FirstOrDefaultAsync(user => user.GoogleSubject == googleSubject, cancellationToken);

    public async Task<IReadOnlyList<User>> ListByAccountAsync(long accountId, CancellationToken cancellationToken = default)
        => await Context.Users
            .AsNoTracking()
            .Where(user => user.AccountId == accountId)
            .OrderBy(user => user.Id)
            .ToListAsync(cancellationToken);
}
