using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectOriginRepository : IBaseRepository<ProjectOrigin>
{
    /// <summary>Enderecos autorizados do projeto, em ordem alfabetica.</summary>
    Task<IReadOnlyList<ProjectOrigin>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A mesma lista, para quem chega <b>sem sessao</b>: o quadro aberto no site de
    /// um cliente, perguntando se aquela pagina pode abri-lo.
    ///
    /// <para>Existe separada porque o filtro global exige que o endereco pertenca a
    /// conta da sessao, e ali a conta atual e zero — a lista inteira voltaria vazia,
    /// e lista vazia autoriza qualquer lugar. A conferencia passaria a autorizar
    /// justamente quem ela existe para barrar, sem erro em lugar nenhum.</para>
    /// </summary>
    Task<IReadOnlyList<ProjectOrigin>> ListByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>Este dominio ja esta autorizado no projeto?</summary>
    Task<bool> DomainExistsAsync(long projectId, string domain, CancellationToken cancellationToken = default);

    /// <summary>Quantos enderecos o projeto ja autorizou.</summary>
    Task<int> CountByProjectAsync(long projectId, CancellationToken cancellationToken = default);
}
