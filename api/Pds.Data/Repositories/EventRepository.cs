using Microsoft.EntityFrameworkCore;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class EventRepository : IEventRepository
{
    private readonly DataContext _context;

    public EventRepository(DataContext context)
    {
        _context = context;
    }

    public async Task<Event> AddAsync(Event entity, CancellationToken cancellationToken = default)
    {
        await _context.Events.AddAsync(entity, cancellationToken);
        return entity;
    }

    public async Task<IReadOnlyList<Event>> ListByReportAsync(long reportId, CancellationToken cancellationToken = default)
        // O autor vem junto: o historico mostra quem fez, e buscar usuario por
        // usuario depois seria uma consulta por linha da tela.
        //
        // Ordena por OccurredAt, e nao por CreatedAt: as duas divergem quando houve
        // retentativa, e usar a errada desloca o evento para o momento em que o
        // sistema se recuperou, e nao para aquele em que a coisa aconteceu.
        => await _context.Events
            .Include(entity => entity.User)
            .Where(entity => entity.ReportId == reportId)
            .OrderBy(entity => entity.OccurredAt)
            .ThenBy(entity => entity.Id)
            .ToListAsync(cancellationToken);
}
