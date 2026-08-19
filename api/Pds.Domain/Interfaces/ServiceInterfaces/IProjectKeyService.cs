using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IProjectKeyService
{
    /// <summary>
    /// Chaves do projeto, incluindo as revogadas. A secreta vem sempre sem valor,
    /// so com o prefixo.
    /// </summary>
    Task<IReadOnlyList<ProjectKeyViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Revoga a chave secreta atual e gera uma nova, devolvendo o valor uma unica
    /// vez. A anterior nao e sobrescrita: fica como historico, com a data em que
    /// deixou de valer.
    /// </summary>
    Task<RevealedSecretKeyViewModel> RegenerateSecretAsync(Guid projectPublicId, CancellationToken cancellationToken = default);
}
