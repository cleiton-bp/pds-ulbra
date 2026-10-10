using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>Os limites de relato de um projeto, lidos e trocados juntos.</summary>
public interface IProjectReportLimitsService
{
    /// <summary>Os limites do projeto; sem linha salva, os de fabrica.</summary>
    Task<ReportLimitsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>Substitui os limites. Todos os campos vem, cada um na faixa dele.</summary>
    Task<ReportLimitsViewModel> ReplaceAsync(Guid projectPublicId, ReportLimitsDto dto, CancellationToken cancellationToken = default);
}
