using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IProjectPublicStageService
{
    /// <summary>A jornada do projeto, na ordem.</summary>
    Task<IReadOnlyList<ProjectPublicStageViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Acrescenta uma etapa no fim da jornada.
    /// </summary>
    /// <exception cref="Exceptions.ConflictException">
    /// A jornada ja tem o maximo de etapas, ou o rotulo se repete.
    /// </exception>
    Task<ProjectPublicStageViewModel> CreateAsync(Guid projectPublicId, SaveProjectPublicStageDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reescreve uma etapa. Todos os campos vem juntos: e a tela inteira daquela
    /// etapa sendo salva, e nao um campo de cada vez.
    /// </summary>
    Task<ProjectPublicStageViewModel> UpdateAsync(Guid projectPublicId, Guid stagePublicId, SaveProjectPublicStageDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Tira a etapa da jornada.
    /// </summary>
    /// <exception cref="Exceptions.ConflictException">
    /// A jornada ficaria abaixo do minimo.
    /// </exception>
    Task RemoveAsync(Guid projectPublicId, Guid stagePublicId, CancellationToken cancellationToken = default);

    /// <summary>Reescreve a ordem da jornada inteira de uma vez.</summary>
    Task<IReadOnlyList<ProjectPublicStageViewModel>> ReorderAsync(Guid projectPublicId, ReorderProjectPublicStagesDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Preenche a jornada com o conjunto padrao.
    ///
    /// <para>So funciona com a jornada <b>vazia</b>. Existe para o projeto criado
    /// antes desta tabela: projeto novo ja nasce com o conjunto, e deixar esta rota
    /// somar ao que ja existe faria dela um jeito de duplicar rotulo.</para>
    /// </summary>
    Task<IReadOnlyList<ProjectPublicStageViewModel>> ApplyFactoryAsync(Guid projectPublicId, CancellationToken cancellationToken = default);
}
