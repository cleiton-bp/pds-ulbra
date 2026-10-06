using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class CardLinkRepository : BaseRepository<CardLink, DataContext>, ICardLinkRepository
{
    public CardLinkRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<CardLink>> ListByCardAsync(long reportId, CancellationToken cancellationToken = default)
        => await Context.CardLinks
            .AsNoTracking()
            .Include(link => link.FromReport).ThenInclude(report => report.ProjectState)
            .Include(link => link.ToReport).ThenInclude(report => report.ProjectState)
            .Where(link => link.FromReportId == reportId || link.ToReportId == reportId)
            .OrderBy(link => link.CreatedAt)
            .ThenBy(link => link.Id)
            .ToListAsync(cancellationToken);

    public Task<CardLink?> FindByPublicIdAsync(long reportId, Guid linkPublicId, CancellationToken cancellationToken = default)
        => Context.CardLinks
            .Include(link => link.FromReport)
            .Include(link => link.ToReport)
            .FirstOrDefaultAsync(link => link.PublicId == linkPublicId
                                         && (link.FromReportId == reportId || link.ToReportId == reportId), cancellationToken);

    public Task<CardLink?> FindBetweenAsync(long reportId, long otherId, CancellationToken cancellationToken = default)
        => Context.CardLinks
            .FirstOrDefaultAsync(link => (link.FromReportId == reportId && link.ToReportId == otherId)
                                         || (link.FromReportId == otherId && link.ToReportId == reportId), cancellationToken);

    public Task<CardLink?> FindOriginalLinkWithoutSessionAsync(long duplicateId, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a do acesso: quem
        // chega aqui ja provou que pode mexer neste card, pelo token ou pela sessao.
        => Context.CardLinks
            .IgnoreQueryFilters()
            .Include(link => link.ToReport)
            .FirstOrDefaultAsync(link => link.FromReportId == duplicateId
                                         && link.Type == CardLinkTypeEnum.DuplicateOf
                                         && link.DeletedAt == null
                                         && link.ToReport.DeletedAt == null, cancellationToken);

    public Task<List<CardLink>> ListDuplicateLinksAsync(long originalId, CancellationToken cancellationToken = default)
        => Context.CardLinks
            .Include(link => link.FromReport)
            .Where(link => link.ToReportId == originalId && link.Type == CardLinkTypeEnum.DuplicateOf)
            .OrderBy(link => link.Id)
            .ToListAsync(cancellationToken);

    public Task<List<Report>> ListDuplicateReportsWithoutSessionAsync(long originalId, CancellationToken cancellationToken = default)
        // So o relato: e ele que tem quem relatou para ler a etapa e o desfecho.
        => Context.CardLinks
            .IgnoreQueryFilters()
            .Where(link => link.ToReportId == originalId
                           && link.Type == CardLinkTypeEnum.DuplicateOf
                           && link.DeletedAt == null
                           && link.FromReport.DeletedAt == null
                           && link.FromReport.Kind == CardKindEnum.Report)
            .OrderBy(link => link.Id)
            .Select(link => link.FromReport)
            .ToListAsync(cancellationToken);
}
