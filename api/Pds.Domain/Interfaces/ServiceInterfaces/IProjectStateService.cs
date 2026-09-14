using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// A fila de trabalho de um projeto: criar, renomear, reordenar e aposentar os
/// estados que o proprio cliente definiu.
/// </summary>
public interface IProjectStateService
{
    /// <summary>A fila do projeto, na ordem, com os aposentados no lugar onde estao.</summary>
    Task<IReadOnlyList<ProjectStateViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>Cria um estado no fim da fila.</summary>
    Task<ProjectStateViewModel> CreateAsync(Guid projectPublicId, CreateProjectStateDto dto, CancellationToken cancellationToken = default);

    /// <summary>Troca o nome de um estado, sem tocar no que ja aconteceu.</summary>
    Task<ProjectStateViewModel> RenameAsync(Guid projectPublicId, Guid statePublicId, RenameProjectStateDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reescreve a ordem da fila inteira de uma vez.
    ///
    /// <para>E uma operacao so, e nao uma por estado, porque arrastar um item mexe
    /// na posicao de todos os que estao entre a origem e o destino: em chamadas
    /// separadas, uma falha no meio deixaria a fila numa ordem que ninguem pediu.</para>
    /// </summary>
    Task<IReadOnlyList<ProjectStateViewModel>> ReorderAsync(Guid projectPublicId, ReorderProjectStatesDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Aposenta um estado: ele para de receber relato novo e sai da lista de
    /// destinos, mas continua existindo onde ja foi usado.
    /// </summary>
    Task<ProjectStateViewModel> DeactivateAsync(Guid projectPublicId, Guid statePublicId, CancellationToken cancellationToken = default);

    /// <summary>Traz um estado aposentado de volta para a fila.</summary>
    Task<ProjectStateViewModel> ActivateAsync(Guid projectPublicId, Guid statePublicId, CancellationToken cancellationToken = default);
}
