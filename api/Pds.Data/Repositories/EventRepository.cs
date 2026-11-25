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
    {
        var leiturasDoTime = LeiturasDoTime(reportId);

        // O autor vem junto: o historico mostra quem fez, e buscar usuario por
        // usuario depois seria uma consulta por linha da tela.
        //
        // Ordena por OccurredAt, e nao por CreatedAt: as duas divergem quando houve
        // retentativa, e usar a errada desloca o evento para o momento em que o
        // sistema se recuperou, e nao para aquele em que a coisa aconteceu.
        //
        // Das leituras do time, so a primeira: ver a interface.
        return await _context.Events
            .Include(entity => entity.User)
            .Where(entity => entity.ReportId == reportId)
            .Where(entity => entity.Type != EventTypeEnum.ReportViewed
                             || entity.Source != EventSourceEnum.Panel
                             || entity.Id == leiturasDoTime
                                 .OrderBy(leitura => leitura.OccurredAt)
                                 .ThenBy(leitura => leitura.Id)
                                 .Select(leitura => leitura.Id)
                                 .FirstOrDefault())
            .OrderBy(entity => entity.OccurredAt)
            .ThenBy(entity => entity.Id)
            .ToListAsync(cancellationToken);
    }

    public async Task<HistoryPage?> ListHistoryPageAsync(long reportId, Guid? beforePublicId, int limit, bool comVoltas, CancellationToken cancellationToken = default)
    {
        var historico = Historico(reportId, comVoltas);

        var pedaco = historico;
        if (beforePublicId is Guid antes)
        {
            var ponto = await _context.Events
                .Where(entity => entity.ReportId == reportId && entity.PublicId == antes)
                .Select(entity => new { entity.OccurredAt, entity.Id })
                .FirstOrDefaultAsync(cancellationToken);
            if (ponto is null)
                return null;

            pedaco = pedaco.Where(entity => entity.OccurredAt < ponto.OccurredAt
                                            || (entity.OccurredAt == ponto.OccurredAt && entity.Id < ponto.Id));
        }

        // Um a mais que o pedido: se ele vier, ha mais antigos.
        var itens = await pedaco
            .Include(entity => entity.User)
            .OrderByDescending(entity => entity.OccurredAt)
            .ThenByDescending(entity => entity.Id)
            .Take(limit + 1)
            .ToListAsync(cancellationToken);

        var total = await historico.CountAsync(cancellationToken);
        var visitas = await LeiturasDeQuemRelatou(reportId).CountAsync(cancellationToken);
        var primeiraVisita = await LeiturasDeQuemRelatou(reportId)
            .OrderBy(leitura => leitura.OccurredAt)
            .ThenBy(leitura => leitura.Id)
            .Select(leitura => (Guid?)leitura.PublicId)
            .FirstOrDefaultAsync(cancellationToken);

        return new HistoryPage(
            itens.Take(limit).ToList(),
            itens.Count > limit,
            total,
            comVoltas ? 0 : Math.Max(visitas - 1, 0),
            primeiraVisita);
    }

    /// <summary>
    /// Os eventos que o historico mostra: tudo, menos as leituras repetidas. Do time, so a
    /// primeira; de quem relatou, so a primeira, e as voltas com <paramref name="comVoltas"/>.
    /// </summary>
    private IQueryable<Event> Historico(long reportId, bool comVoltas)
    {
        var leiturasDoTime = LeiturasDoTime(reportId);
        var leiturasDeFora = LeiturasDeQuemRelatou(reportId);

        return _context.Events
            .Where(entity => entity.ReportId == reportId)
            .Where(entity => entity.Type != EventTypeEnum.ReportViewed
                             || (entity.Source == EventSourceEnum.Panel
                                 && entity.Id == leiturasDoTime
                                     .OrderBy(leitura => leitura.OccurredAt)
                                     .ThenBy(leitura => leitura.Id)
                                     .Select(leitura => leitura.Id)
                                     .FirstOrDefault())
                             || (entity.Source == EventSourceEnum.PublicPage
                                 && (comVoltas
                                     || entity.Id == leiturasDeFora
                                         .OrderBy(leitura => leitura.OccurredAt)
                                         .ThenBy(leitura => leitura.Id)
                                         .Select(leitura => leitura.Id)
                                         .FirstOrDefault()))
                             || (entity.Source != EventSourceEnum.Panel
                                 && entity.Source != EventSourceEnum.PublicPage));
    }

    public Task<bool> AnyPanelViewAsync(long reportId, CancellationToken cancellationToken = default)
        => LeiturasDoTime(reportId).AnyAsync(cancellationToken);

    /// <summary>As aberturas da pagina de acompanhamento, por quem relatou.</summary>
    private IQueryable<Event> LeiturasDeQuemRelatou(long reportId)
        => _context.Events.Where(leitura => leitura.ReportId == reportId
                                            && leitura.Type == EventTypeEnum.ReportViewed
                                            && leitura.Source == EventSourceEnum.PublicPage);

    /// <summary>As aberturas do relato pelo painel — as do time, e nao as de quem relatou.</summary>
    private IQueryable<Event> LeiturasDoTime(long reportId)
        => _context.Events.Where(leitura => leitura.ReportId == reportId
                                            && leitura.Type == EventTypeEnum.ReportViewed
                                            && leitura.Source == EventSourceEnum.Panel);

    public async Task<IReadOnlyList<Event>> ListPublicStageChangesWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default)
        // O tipo esta na **consulta**, e nao num filtro depois: o que nao for
        // mudanca de etapa publica nunca chega a sair daqui. Sem o `Include` do
        // usuario, tambem de proposito — quem relatou nao precisa saber o nome de
        // quem mexeu, e nao carregar e mais seguro do que carregar e nao usar.
        //
        // Sem sessao a lista de projetos acessiveis esta vazia, entao o filtro global e desligado. Nao ha
        // condicao de exclusao logica para reescrever: evento nao se apaga.
        => await _context.Events
            .IgnoreQueryFilters()
            .Where(entity => entity.ReportId == reportId
                             && entity.Type == EventTypeEnum.ReportPublicStageChanged)
            .OrderBy(entity => entity.OccurredAt)
            .ThenBy(entity => entity.Id)
            .ToListAsync(cancellationToken);

    public Task<int> CountInvitationEmailsSinceAsync(long projectId, DateTime since, CancellationToken cancellationToken = default)
        // Os dois tipos escritos na consulta, e nao uma lista: a coluna e texto
        // convertido do enum, e comparacao direta e o que vira SQL sem surpresa.
        => _context.Events
            .Where(entity => entity.ProjectId == projectId
                             && (entity.Type == EventTypeEnum.ProjectInvitationSent
                                 || entity.Type == EventTypeEnum.ProjectInvitationResent)
                             && entity.OccurredAt >= since)
            .CountAsync(cancellationToken);

    public Task<int> CountAccountInvitationEmailsSinceAsync(long accountId, DateTime since, CancellationToken cancellationToken = default)
        // A mesma contagem, pela conta: quem cria projeto novo nao ganha cota nova.
        // IgnoreQueryFilters desliga o filtro de acesso, que somaria so os projetos de quem
        // pede: um administrador vindo de outra conta enxerga so os dele, e o teto da conta
        // nao valeria. A conta vem de um projeto que a rota ja autorizou e esta reescrita a
        // mao logo abaixo; o que sai daqui e so um numero.
        => _context.Events
            .IgnoreQueryFilters()
            .Where(entity => entity.AccountId == accountId
                             && (entity.Type == EventTypeEnum.ProjectInvitationSent
                                 || entity.Type == EventTypeEnum.ProjectInvitationResent)
                             && entity.OccurredAt >= since)
            .CountAsync(cancellationToken);
}
