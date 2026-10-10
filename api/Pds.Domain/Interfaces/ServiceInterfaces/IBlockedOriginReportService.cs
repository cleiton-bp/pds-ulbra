using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// O que o time decide sobre os relatos que vieram de um endereco bloqueado: manter,
/// ou apagar de vez.
/// </summary>
public interface IBlockedOriginReportService
{
    /// <summary>Mantem os cards: a marca sai, e eles seguem como qualquer outro.</summary>
    Task<BlockedOriginReportsResultViewModel> KeepAsync(Guid projectPublicId, BlockedOriginReportsDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Apaga de vez os cards, as subtarefas deles e tudo que identifica quem relatou.
    /// Sem volta.
    /// </summary>
    Task<BlockedOriginReportsResultViewModel> DeleteAsync(Guid projectPublicId, DeleteBlockedOriginReportsDto dto, CancellationToken cancellationToken = default);
}
