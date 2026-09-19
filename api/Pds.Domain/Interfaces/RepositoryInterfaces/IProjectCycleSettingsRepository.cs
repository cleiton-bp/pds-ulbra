using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>As regras do ciclo de um projeto. No maximo uma linha.</summary>
public interface IProjectCycleSettingsRepository : IBaseRepository<ProjectCycleSettings>
{
    /// <summary>
    /// A configuracao do projeto, ou <b>nulo</b> quando ninguem salvou nada ainda —
    /// e nesse caso valem os padroes de <see cref="CycleSettingsDefaults"/>.
    /// </summary>
    Task<ProjectCycleSettings?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A mesma leitura para quem chega <b>sem sessao</b>: a pagina de
    /// acompanhamento, que precisa saber se reabrir existe neste projeto.
    /// </summary>
    Task<ProjectCycleSettings?> FindByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);
}
