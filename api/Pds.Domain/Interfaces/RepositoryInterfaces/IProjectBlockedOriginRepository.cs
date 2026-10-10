using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectBlockedOriginRepository : IBaseRepository<ProjectBlockedOrigin>
{
    /// <summary>Enderecos bloqueados do projeto, do mais novo para o mais antigo.</summary>
    Task<IReadOnlyList<ProjectBlockedOrigin>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A mesma lista, para quem chega <b>sem sessao</b>: a ferramenta aberta no site
    /// de um cliente e a entrada do relato.
    ///
    /// <para>Existe separada pelo mesmo motivo da lista de autorizados: com o filtro
    /// global e sem sessao ela voltaria vazia — e uma lista de bloqueados vazia deixa
    /// passar justamente quem foi bloqueado, sem erro em lugar nenhum.</para>
    /// </summary>
    Task<IReadOnlyList<ProjectBlockedOrigin>> ListByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>A linha deste dominio, rastreada, ou nula.</summary>
    Task<ProjectBlockedOrigin?> FindByDomainAsync(long projectId, string domain, CancellationToken cancellationToken = default);

    /// <summary>Quantos enderecos o projeto ja bloqueou.</summary>
    Task<int> CountByProjectAsync(long projectId, CancellationToken cancellationToken = default);
}
