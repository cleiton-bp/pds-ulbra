using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IProjectOriginService
{
    /// <summary>Enderecos autorizados do projeto, em ordem alfabetica.</summary>
    Task<IReadOnlyList<ProjectOriginViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Autoriza um endereco. O dominio e normalizado antes de gravar, e o mesmo
    /// endereco nao entra duas vezes no projeto.
    /// </summary>
    Task<ProjectOriginViewModel> CreateAsync(Guid projectPublicId, CreateProjectOriginDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Retira a autorizacao. E exclusao logica: a linha fica, para o historico
    /// contar quando cada endereco valeu.
    /// </summary>
    Task DeleteAsync(Guid projectPublicId, Guid originPublicId, CancellationToken cancellationToken = default);
}
