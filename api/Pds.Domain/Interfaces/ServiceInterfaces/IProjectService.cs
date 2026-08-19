using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IProjectService
{
    /// <summary>Cria o projeto e ja gera o par de chaves. A secreta so aparece nesta resposta.</summary>
    Task<ProjectCreatedViewModel> CreateAsync(CreateProjectDto dto, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ProjectViewModel>> ListAsync(CancellationToken cancellationToken = default);

    Task<ProjectViewModel> GetAsync(Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>Renomeia e/ou arquiva.</summary>
    Task<ProjectViewModel> UpdateAsync(Guid publicId, UpdateProjectDto dto, CancellationToken cancellationToken = default);
}
