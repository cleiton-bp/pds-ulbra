using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IProjectPriorityService
{
    Task<IReadOnlyList<ProjectPriorityViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    Task<ProjectPriorityViewModel> CreateAsync(Guid projectPublicId, CreateProjectPriorityDto dto, CancellationToken cancellationToken = default);

    Task<ProjectPriorityViewModel> UpdateAsync(Guid projectPublicId, Guid priorityPublicId, UpdateProjectPriorityDto dto, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ProjectPriorityViewModel>> ReorderAsync(Guid projectPublicId, ReorderProjectPrioritiesDto dto, CancellationToken cancellationToken = default);

    Task<ProjectPriorityViewModel> DeactivateAsync(Guid projectPublicId, Guid priorityPublicId, CancellationToken cancellationToken = default);

    Task<ProjectPriorityViewModel> ActivateAsync(Guid projectPublicId, Guid priorityPublicId, CancellationToken cancellationToken = default);
}
