using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// Os tipos de relato de um projeto, como as prioridades: criar, mudar, reordenar,
/// desativar e reativar. Ver <see cref="Pds.Domain.Entities.ProjectReportType"/>.
/// </summary>
public interface IProjectReportTypeService
{
    Task<IReadOnlyList<ProjectReportTypeViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    Task<ProjectReportTypeViewModel> CreateAsync(Guid projectPublicId, CreateProjectReportTypeDto dto, CancellationToken cancellationToken = default);

    Task<ProjectReportTypeViewModel> UpdateAsync(Guid projectPublicId, Guid typePublicId, UpdateProjectReportTypeDto dto, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ProjectReportTypeViewModel>> ReorderAsync(Guid projectPublicId, ReorderProjectReportTypesDto dto, CancellationToken cancellationToken = default);

    Task<ProjectReportTypeViewModel> DeactivateAsync(Guid projectPublicId, Guid typePublicId, CancellationToken cancellationToken = default);

    Task<ProjectReportTypeViewModel> ActivateAsync(Guid projectPublicId, Guid typePublicId, CancellationToken cancellationToken = default);
}
