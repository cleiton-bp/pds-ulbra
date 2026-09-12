using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectWidgetSettingsRepository : IBaseRepository<ProjectWidgetSettings>
{
    /// <summary>
    /// A configuracao de um projeto da conta atual, ou nulo quando ninguem salvou
    /// nada ainda — e nulo aqui nao e falta, e o projeto usando os padroes.
    /// </summary>
    Task<ProjectWidgetSettings?> GetByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A mesma configuracao, para quem chega **sem sessao**: o proprio quadro,
    /// rodando no site de um visitante.
    ///
    /// <para><c>IgnoreQueryFilters</c> desliga o isolamento por conta <b>e</b> o de
    /// exclusao logica, entao as duas condicoes que o filtro garantia estao
    /// reescritas a mao. Retirar qualquer uma delas faz a configuracao de um
    /// projeto apagado voltar a valer, sem nada acusar.</para>
    /// </summary>
    Task<ProjectWidgetSettings?> FindByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);
}
