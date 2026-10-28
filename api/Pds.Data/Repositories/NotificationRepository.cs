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

    public async Task<IReadOnlyList<Notification>> ListForUserAsync(
        long userId,
        bool unreadOnly,
        (DateTime CreatedAt, long Id)? before,
        int take,
        CancellationToken cancellationToken = default)
    {
        var consulta = Context.Notifications
            .AsNoTracking()
            .Include(aviso => aviso.ActorUser)
            .Include(aviso => aviso.Project)
            .Include(aviso => aviso.Report)
            .Include(aviso => aviso.ReportInternalComment)
            .Where(aviso => aviso.UserId == userId);

        if (unreadOnly)
            consulta = consulta.Where(aviso => aviso.ReadAt == null);

        // A pagina seguinte pela hora e pela chave do ultimo que a tela tem, e nao por
        // deslocamento: o aviso novo que chega no topo, ou o que se le no meio, nao faz a
        // pagina seguinte repetir nem pular ninguem.
        if (before is var (hora, id))
            consulta = consulta.Where(aviso => aviso.CreatedAt < hora || (aviso.CreatedAt == hora && aviso.Id < id));

        return await consulta
            .OrderByDescending(aviso => aviso.CreatedAt)
            .ThenByDescending(aviso => aviso.Id)
            .Take(take)
            .ToListAsync(cancellationToken);
    }

    public Task<int> CountUnreadAsync(long userId, CancellationToken cancellationToken = default)
        => Context.Notifications.CountAsync(aviso => aviso.UserId == userId && aviso.ReadAt == null, cancellationToken);

    public Task<Notification?> FindForUserAsync(long userId, Guid publicId, CancellationToken cancellationToken = default)
        => Context.Notifications.FirstOrDefaultAsync(aviso => aviso.UserId == userId && aviso.PublicId == publicId, cancellationToken);

    public async Task<int> MarkAllReadAsync(long userId, DateTime readAt, CancellationToken cancellationToken = default)
    {
        // Os avisos pelo filtro global: o aviso de um projeto que a pessoa nao enxerga mais
        // fica como estava — se ela voltar ao time, ele volta como era.
        var ids = await Context.Notifications
            .Where(aviso => aviso.UserId == userId && aviso.ReadAt == null)
            .Select(aviso => aviso.Id)
            .ToListAsync(cancellationToken);

        if (ids.Count == 0)
            return 0;

        // A gravacao numa so, pelos ids ja filtrados acima — e por isso sem o filtro aqui:
        // desde o aviso sem card, ele junta o relato de forma opcional, e o UPDATE em lote
        // nao traduz essa juncao (dava 500). So o que continua sem leitura: o aviso lido em
        // outra aba no meio fica com a hora dele.
        return await Context.Notifications
            .IgnoreQueryFilters()
            .Where(aviso => ids.Contains(aviso.Id) && aviso.ReadAt == null)
            .ExecuteUpdateAsync(set => set
                .SetProperty(aviso => aviso.ReadAt, readAt)
                .SetProperty(aviso => aviso.UpdatedAt, readAt), cancellationToken);
    }
}
