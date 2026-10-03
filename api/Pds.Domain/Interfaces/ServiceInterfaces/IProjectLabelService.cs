using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IProjectLabelService
{
    Task<IReadOnlyList<ProjectLabelViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Cria a etiqueta — ou devolve a que ja existe com o mesmo nome, sem diferenciar
    /// maiuscula. <c>Created</c> diz qual dos dois aconteceu.
    /// </summary>
    Task<(ProjectLabelViewModel Label, bool Created)> CreateAsync(Guid projectPublicId, CreateProjectLabelDto dto, CancellationToken cancellationToken = default);

    Task<ProjectLabelViewModel> UpdateAsync(Guid projectPublicId, Guid labelPublicId, UpdateProjectLabelDto dto, CancellationToken cancellationToken = default);

    Task DeleteAsync(Guid projectPublicId, Guid labelPublicId, CancellationToken cancellationToken = default);
}
