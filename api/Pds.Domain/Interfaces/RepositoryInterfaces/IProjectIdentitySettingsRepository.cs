using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>Como quem relata e identificado num projeto. No maximo uma linha.</summary>
public interface IProjectIdentitySettingsRepository : IBaseRepository<ProjectIdentitySettings>
{
    /// <summary>
    /// A configuracao do projeto, ou <b>nulo</b> quando ninguem salvou nada ainda —
    /// e nesse caso valem os padroes de <see cref="IdentitySettingsDefaults"/>.
    /// </summary>
    Task<ProjectIdentitySettings?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A mesma leitura para quem chega <b>sem sessao</b>: a rota publica de relato,
    /// que precisa saber se este projeto usa codigo pessoal antes de gravar.
    /// </summary>
    Task<ProjectIdentitySettings?> FindByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);
}
