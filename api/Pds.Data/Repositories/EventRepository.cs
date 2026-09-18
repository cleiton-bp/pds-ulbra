using Microsoft.EntityFrameworkCore;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
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

    public async Task<IReadOnlyList<Event>> ListPublicStageChangesWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default)
        // O tipo esta na **consulta**, e nao num filtro depois: o que nao for
        // mudanca de etapa publica nunca chega a sair daqui. Sem o `Include` do
        // usuario, tambem de proposito — quem relatou nao precisa saber o nome de
        // quem mexeu, e nao carregar e mais seguro do que carregar e nao usar.
        //
        // Sem sessao a conta atual e zero, entao o filtro global e desligado. Nao ha
        // condicao de exclusao logica para reescrever: evento nao se apaga.
        => await _context.Events
            .IgnoreQueryFilters()
            .Where(entity => entity.ReportId == reportId
                             && entity.Type == EventTypeEnum.ReportPublicStageChanged)
            .OrderBy(entity => entity.OccurredAt)
            .ThenBy(entity => entity.Id)
            .ToListAsync(cancellationToken);
}
