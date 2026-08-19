using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class AccountRepository : BaseRepository<Account, DataContext>, IAccountRepository
{
    public AccountRepository(DataContext context) : base(context)
    {
    }
}
