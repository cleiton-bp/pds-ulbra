using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class NotificationRepository : BaseRepository<Notification, DataContext>, INotificationRepository
{
    public NotificationRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<Notification>> ListForUserAsync(long userId, int take, CancellationToken cancellationToken = default)
        => await Context.Notifications
            .AsNoTracking()
            .Include(aviso => aviso.ActorUser)
            .Include(aviso => aviso.Project)
            .Include(aviso => aviso.Report)
            .Where(aviso => aviso.UserId == userId)
            .OrderByDescending(aviso => aviso.CreatedAt)
            .ThenByDescending(aviso => aviso.Id)
            .Take(take)
            .ToListAsync(cancellationToken);

    public Task<int> CountUnreadAsync(long userId, CancellationToken cancellationToken = default)
        => Context.Notifications.CountAsync(aviso => aviso.UserId == userId && aviso.ReadAt == null, cancellationToken);

    public Task<Notification?> FindForUserAsync(long userId, Guid publicId, CancellationToken cancellationToken = default)
        => Context.Notifications.FirstOrDefaultAsync(aviso => aviso.UserId == userId && aviso.PublicId == publicId, cancellationToken);

    public Task<int> MarkAllReadAsync(long userId, DateTime readAt, CancellationToken cancellationToken = default)
        // Pelo filtro global: o aviso de um projeto que a pessoa nao enxerga mais fica
        // como estava — se ela voltar ao time, ele volta como era.
        => Context.Notifications
            .Where(aviso => aviso.UserId == userId && aviso.ReadAt == null)
            .ExecuteUpdateAsync(set => set
                .SetProperty(aviso => aviso.ReadAt, readAt)
                .SetProperty(aviso => aviso.UpdatedAt, readAt), cancellationToken);

    public async Task<(Notification Aviso, bool AindaNoTime)?> FindForEmailWithoutSessionAsync(Guid publicId, CancellationToken cancellationToken = default)
    {
        // As condicoes do filtro global reescritas a mao, menos a do acesso — que aqui e
        // a pergunta: quem recebe ainda e dono da conta do projeto, ou esta no time dele?
        var achado = await Context.Notifications
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Include(aviso => aviso.User)
            .Include(aviso => aviso.ActorUser)
            .Include(aviso => aviso.Project)
            .Include(aviso => aviso.Report)
            .Where(aviso => aviso.PublicId == publicId
                            && aviso.DeletedAt == null
                            && aviso.Report.DeletedAt == null
                            && aviso.Project.DeletedAt == null
                            && aviso.User.DeletedAt == null)
            .Select(aviso => new
            {
                Aviso = aviso,
                AindaNoTime = aviso.Project.AccountId == aviso.User.AccountId
                              || Context.ProjectMembers.IgnoreQueryFilters().Any(membro =>
                                  membro.ProjectId == aviso.ProjectId
                                  && membro.UserId == aviso.UserId
                                  && membro.DeletedAt == null),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return achado is null ? null : (achado.Aviso, achado.AindaNoTime);
    }
}
