using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectStateRepository : IBaseRepository<ProjectState>
{
    /// <summary>
    /// A fila de trabalho do projeto, na ordem que o cliente definiu, com os
    /// aposentados no meio onde sempre estiveram.
    ///
    /// <para>Traz os aposentados junto de proposito: e a mesma lista que a tela
    /// mostra e a mesma que a reordenacao reescreve — se a leitura escondesse
    /// parte dela, reordenar apagaria a posicao do que ficou de fora.</para>
    /// </summary>
    Task<IReadOnlyList<ProjectState>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Este nome ja existe no projeto, sem diferenciar maiuscula de minuscula?
    ///
    /// <para><paramref name="exceptId"/> e o proprio estado ao renomear: sem ele,
    /// salvar o nome que ja esta la esbarraria no proprio registro.</para>
    /// </summary>
    Task<bool> NameExistsAsync(long projectId, string name, long? exceptId = null, CancellationToken cancellationToken = default);

    /// <summary>A maior posicao ja usada no projeto, ou nulo quando a fila esta vazia.</summary>
    Task<int?> LastPositionAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// O primeiro estado ativo da fila, para quem chega <b>sem sessao</b>. E o
    /// destino padrao do relato quando o cliente nunca escolheu onde aquele tipo
    /// cai.
    ///
    /// <para>Devolve nulo quando o projeto nao tem estado ativo nenhum — caso que
    /// existe de verdade, e em que o relato entra sem lugar na fila em vez de ser
    /// recusado.</para>
    /// </summary>
    Task<ProjectState?> FirstActiveWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);
}
