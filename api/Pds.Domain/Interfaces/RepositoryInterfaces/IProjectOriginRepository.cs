using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectOriginRepository : IBaseRepository<ProjectOrigin>
{
    /// <summary>Enderecos autorizados do projeto, em ordem alfabetica.</summary>
    Task<IReadOnlyList<ProjectOrigin>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A mesma lista, para quem chega <b>sem sessao</b>: o quadro aberto no site de
    /// um cliente, cujo relato entra direto ou fica retido conforme ela.
    ///
    /// <para>Existe separada porque o filtro global exige que o endereco seja de um
    /// projeto que a pessoa da sessao enxerga, e ali nao ha sessao — a lista inteira
    /// voltaria vazia, e todo relato ficaria retido — inclusive o do endereco que o
    /// cliente autorizou, sem erro em lugar nenhum.</para>
    /// </summary>
    Task<IReadOnlyList<ProjectOrigin>> ListByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>Este dominio ja esta autorizado no projeto?</summary>
    Task<bool> DomainExistsAsync(long projectId, string domain, CancellationToken cancellationToken = default);

    /// <summary>
    /// A linha deste dominio, rastreada, ou nula. E por ela que bloquear tira o
    /// endereco da lista de autorizados — as duas listas nunca dizem o contrario uma
    /// da outra sobre o mesmo endereco.
    /// </summary>
    Task<ProjectOrigin?> FindByDomainAsync(long projectId, string domain, CancellationToken cancellationToken = default);

    /// <summary>Quantos enderecos o projeto ja autorizou.</summary>
    Task<int> CountByProjectAsync(long projectId, CancellationToken cancellationToken = default);
}
