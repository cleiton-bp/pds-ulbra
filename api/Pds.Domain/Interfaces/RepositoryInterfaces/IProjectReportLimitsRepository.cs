using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>Os limites de relato de um projeto. No maximo uma linha.</summary>
public interface IProjectReportLimitsRepository : IBaseRepository<ProjectReportLimits>
{
    /// <summary>
    /// A configuracao do projeto, ou <b>nulo</b> quando ninguem salvou nada ainda — e
    /// nesse caso valem os padroes de <see cref="ReportLimitsDefaults"/>.
    /// </summary>
    Task<ProjectReportLimits?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>A mesma leitura para a entrada do relato, que chega <b>sem sessao</b>.</summary>
    Task<ProjectReportLimits?> FindByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);
}
