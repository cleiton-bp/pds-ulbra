using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectReportTypeRepository : IBaseRepository<ProjectReportType>
{
    /// <summary>Os tipos do projeto, na ordem, com os desativados no lugar deles.</summary>
    Task<IReadOnlyList<ProjectReportType>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A mesma lista, para quem chega <b>sem sessao</b>: a propria ferramenta, que
    /// precisa dos tipos para se desenhar.
    ///
    /// <para>Existe separada porque o filtro global exige que a linha seja de um
    /// projeto que a pessoa da sessao enxerga, e ali nao ha sessao — a lista voltaria
    /// vazia, e a ferramenta abriria sem tipo nenhum, sem erro em lugar nenhum.</para>
    /// </summary>
    Task<IReadOnlyList<ProjectReportType>> ListByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// O tipo escolhido no envio do relato, <b>sem sessao</b>, pelo mesmo motivo da
    /// lista acima. So os tipos deste projeto: o identificador de um tipo de outro
    /// projeto volta nulo, como o que nao existe.
    /// </summary>
    Task<ProjectReportType?> FindByPublicIdWithoutSessionAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default);

    Task<bool> NameExistsAsync(long projectId, string name, long? exceptId = null, CancellationToken cancellationToken = default);

    Task<int?> LastPositionAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>Quantos tipos ativos o projeto tem — o teto e o piso da regra.</summary>
    Task<int> CountActiveAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Trava a contagem dos ativos do projeto ate a transacao atual terminar.
    ///
    /// <para><b>E ela que segura o piso e o teto</b> quando duas mudancas chegam juntas:
    /// desativar os dois ultimos ativos ao mesmo tempo, sem ela, veria "dois ativos" nas
    /// duas e deixaria o projeto com nenhum. So vale dentro de uma transacao
    /// (<c>InTransactionAsync</c>).</para>
    /// </summary>
    Task LockActiveCountAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Algum tipo usa este estado como coluna de entrada? E o que impede aposentar um
    /// estado que ainda e a porta de entrada de alguem.
    /// </summary>
    Task<bool> AnyUsingStateAsync(long projectStateId, CancellationToken cancellationToken = default);
}
