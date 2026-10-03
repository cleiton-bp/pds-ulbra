using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>A configuracao do time do projeto.</summary>
public interface IProjectTeamSettingsService
{
    Task<TeamSettingsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    Task<TeamSettingsViewModel> ReplaceAsync(Guid projectPublicId, TeamSettingsDto dto, CancellationToken cancellationToken = default);
}
