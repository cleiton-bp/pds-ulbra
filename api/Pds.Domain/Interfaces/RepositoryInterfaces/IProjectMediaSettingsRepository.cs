using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>O que um projeto aceita receber junto do relato. No maximo uma linha.</summary>
public interface IProjectMediaSettingsRepository : IBaseRepository<ProjectMediaSettings>
{
    /// <summary>
    /// A configuracao do projeto <b>com os limites de cada tipo</b>, ou nulo quando
    /// ninguem salvou nada ainda — e nesse caso valem os padroes de
    /// <see cref="MediaSettingsDefaults"/>.
    ///
    /// <para><b>Traz os tipos junto, sempre.</b> Configuracao sem eles nao responde
    /// a pergunta que a tela faz, e deixar a carga para depois faria uma consulta
    /// por tipo toda vez que alguem abrisse a tela.</para>
    /// </summary>
    Task<ProjectMediaSettings?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A mesma leitura para quem chega <b>sem sessao</b>: o proprio quadro, que
    /// precisa saber se mostra o botao de anexar e sob que limites.
    /// </summary>
    Task<ProjectMediaSettings?> FindByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);
}
