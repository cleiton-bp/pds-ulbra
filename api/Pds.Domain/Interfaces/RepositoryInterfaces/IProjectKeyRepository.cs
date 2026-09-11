using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectKeyRepository : IBaseRepository<ProjectKey>
{
    /// <summary>Todas as chaves do projeto, incluindo as revogadas, da mais nova para a mais antiga.</summary>
    Task<IReadOnlyList<ProjectKey>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>A chave do tipo informado que vale agora no projeto, ou nulo se nao houver.</summary>
    Task<ProjectKey?> GetActiveAsync(long projectId, ProjectKeyTypeEnum type, CancellationToken cancellationToken = default);

    /// <summary>
    /// Acha a chave publica que vale agora pelo valor apresentado, com o projeto
    /// junto. Devolve nulo quando a chave nao existe, foi revogada, nao e publica,
    /// ou o projeto dela foi apagado.
    ///
    /// <para><b>Esta e a unica consulta do sistema que atravessa o filtro de
    /// conta.</b> Ela existe para a rota publica de relato, que chega sem sessao:
    /// nesse momento a conta ainda nao e conhecida, e e justamente a chave que vai
    /// revela-la. Com o filtro ligado a consulta nunca acharia nada, porque a conta
    /// atual e zero.</para>
    ///
    /// <para>O preco de desligar o filtro e que as condicoes que ele garantia
    /// passam a ser responsabilidade de quem escreve a consulta — e e por isso que
    /// ela mora aqui, uma vez, e nao espalhada pelos servicos.</para>
    /// </summary>
    Task<ProjectKey?> FindActivePublicAsync(string value, CancellationToken cancellationToken = default);
}
