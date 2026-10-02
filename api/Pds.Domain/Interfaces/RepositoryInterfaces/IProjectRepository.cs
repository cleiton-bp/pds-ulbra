using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectRepository : IBaseRepository<Project>
{
    /// <summary>
    /// Projetos que a pessoa da requisicao enxerga, do mais recente para o mais
    /// antigo, com a conta dona carregada — e por ela que o painel agrupa.
    /// </summary>
    Task<IReadOnlyList<Project>> ListAsync(CancellationToken cancellationToken = default);

    /// <summary>O projeto pelo identificador publico, com a conta dona carregada; nulo se a pessoa nao o enxerga.</summary>
    Task<Project?> GetWithAccountAsync(Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Ja existe projeto com este nome <b>nesta conta</b>? Ignora o proprio projeto
    /// quando informado, para o renomear nao colidir consigo mesmo.
    ///
    /// <para>A conta vem explicita, e a consulta atravessa o filtro de acesso: o
    /// nome e unico na conta inteira, e quem esta no time de um projeto de outra
    /// conta nao enxerga os projetos vizinhos — sem isto, o nome repetido passaria
    /// pela conferencia e so pararia no indice unico do banco.</para>
    ///
    /// <para><b>Troca aceita:</b> o administrador de um projeto de outra conta, ao
    /// renomear, descobre pelo 409 que existe na conta um projeto com aquele nome,
    /// mesmo sem estar nele. E so o nome, e renomear e configuracao de quem ja
    /// administra o projeto.</para>
    /// </summary>
    Task<bool> NameExistsAsync(long accountId, string name, long? ignoreProjectId = null,
        CancellationToken cancellationToken = default);
}
