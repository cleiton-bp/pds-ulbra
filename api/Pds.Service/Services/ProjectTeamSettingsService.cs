using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;

namespace Pds.Service.Services;

/// <summary>
/// A configuracao do time. Le-se como membro — o prazo do convite aparece na tela
/// de Membros —, e muda-se como administrador, pela rota.
/// </summary>
public class ProjectTeamSettingsService : IProjectTeamSettingsService
{
    private readonly IUnitOfWork _unitOfWork;

    public ProjectTeamSettingsService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<TeamSettingsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectTeamSettings.GetByProjectAsync(project.Id, cancellationToken);

        return Map(settings);
    }

    public async Task<TeamSettingsViewModel> ReplaceAsync(Guid projectPublicId, TeamSettingsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectTeamSettings.GetByProjectAsync(project.Id, cancellationToken);

        var dias = dto.InvitationValidityDays
                   ?? throw new ArgumentException("Informe por quantos dias o convite vale.");

        if (dias is < ProjectTeamSettings.MinInvitationValidityDays or > ProjectTeamSettings.MaxInvitationValidityDays)
            throw new ArgumentException(
                $"O convite vale de {ProjectTeamSettings.MinInvitationValidityDays} a {ProjectTeamSettings.MaxInvitationValidityDays} dias.");

        if (settings is null)
        {
            settings = new ProjectTeamSettings { ProjectId = project.Id, InvitationValidityDays = dias };
            await _unitOfWork.ProjectTeamSettings.AddAsync(settings, cancellationToken);
        }
        else
        {
            // So vale para o proximo convite: quem ja foi convidado continua com o
            // prazo que recebeu no e-mail.
            settings.InvitationValidityDays = dias;
            _unitOfWork.ProjectTeamSettings.Update(settings);
        }

        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(settings);
    }

    private static TeamSettingsViewModel Map(ProjectTeamSettings? settings)
        => new(settings?.InvitationValidityDays ?? TeamSettingsDefaults.InvitationValidityDays);

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
