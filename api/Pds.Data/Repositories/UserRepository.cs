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
        // **Sem o filtro global, com a pessoa apagada reescrita a mao.** A conta que pediu
        // exclusao tem `DeletedAt`, e o filtro dela, num `Include` obrigatorio, esconderia
        // a propria pessoa: o login acharia que e o primeiro acesso e tentaria criar outra
        // com o mesmo Google. E justo esse login, dentro do prazo, que cancela a exclusao.
        => Context.Users
            .IgnoreQueryFilters()
            .Include(user => user.Account)
            .FirstOrDefaultAsync(user => user.GoogleSubject == googleSubject && user.DeletedAt == null, cancellationToken);

    public async Task<IReadOnlyList<User>> ListByAccountAsync(long accountId, CancellationToken cancellationToken = default)
        => await Context.Users
            .AsNoTracking()
            .Where(user => user.AccountId == accountId)
            .OrderBy(user => user.Id)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<User>> ListByPublicIdsAsync(IReadOnlyCollection<Guid> publicIds, CancellationToken cancellationToken = default)
        => await Context.Users
            .AsNoTracking()
            .Where(user => publicIds.Contains(user.PublicId))
            .ToListAsync(cancellationToken);

    public Task<User?> GetWithNotificationSoundsAsync(long userId, CancellationToken cancellationToken = default)
        => Context.Users
            .Include(user => user.NotificationSounds)
            .FirstOrDefaultAsync(user => user.Id == userId, cancellationToken);
}
