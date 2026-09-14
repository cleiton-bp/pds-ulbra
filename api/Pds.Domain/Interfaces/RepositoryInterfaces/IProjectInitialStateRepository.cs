using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectInitialStateRepository : IBaseRepository<ProjectInitialState>
{
    /// <summary>As escolhas do projeto — no maximo uma por tipo, e pode nao haver nenhuma.</summary>
    Task<IReadOnlyList<ProjectInitialState>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>A escolha deste tipo, ou nulo quando o cliente nunca escolheu.</summary>
    Task<ProjectInitialState?> FindByTypeAsync(long projectId, ReportTypeEnum reportType, CancellationToken cancellationToken = default);

    /// <summary>
    /// A mesma busca, para quem chega <b>sem sessao</b>: a entrada do relato, vinda
    /// do site do cliente.
    ///
    /// <para>Existe separada porque o filtro global exige que a linha pertenca a
    /// conta da sessao, e ali a conta atual e zero — a escolha do cliente voltaria
    /// vazia, e todo relato cairia no primeiro estado da fila como se ninguem
    /// tivesse configurado nada. Erro nenhum, e a configuracao simplesmente nao
    /// valendo.</para>
    /// </summary>
    Task<ProjectInitialState?> FindByTypeWithoutSessionAsync(long projectId, ReportTypeEnum reportType, CancellationToken cancellationToken = default);

    /// <summary>
    /// Algum tipo aponta para este estado? E o que impede aposentar um estado que
    /// ainda e a porta de entrada de alguem.
    /// </summary>
    Task<bool> AnyUsingStateAsync(long projectStateId, CancellationToken cancellationToken = default);
}
