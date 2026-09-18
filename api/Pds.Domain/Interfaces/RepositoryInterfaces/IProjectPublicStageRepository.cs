using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectPublicStageRepository : IBaseRepository<ProjectPublicStage>
{
    /// <summary>
    /// A jornada do projeto, na ordem que o cliente definiu.
    ///
    /// <para>Diferente da fila de trabalho, aqui nao ha aposentado para trazer
    /// junto: etapa publica se remove de verdade — exclusao logica —, e o que ja
    /// passou por ela continua legivel porque o evento guarda o rotulo que valia na
    /// epoca.</para>
    /// </summary>
    Task<IReadOnlyList<ProjectPublicStage>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A jornada do projeto, para quem chega <b>sem sessao</b>.
    ///
    /// <para>E a leitura que a entrada do relato faz: o relato chega pela chave
    /// publica, sem sessao, e precisa ja nascer numa etapa. Sem sessao a conta atual
    /// e zero, e o filtro que protege o painel devolveria vazio para o proprio
    /// dono.</para>
    /// </summary>
    Task<IReadOnlyList<ProjectPublicStage>> ListByProjectWithoutSessionAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Este rotulo ja existe na jornada, sem diferenciar maiuscula de minuscula?
    ///
    /// <para><paramref name="exceptId"/> e a propria etapa ao editar, senao salvar o
    /// rotulo que ja esta la esbarraria no proprio registro.</para>
    /// </summary>
    Task<bool> LabelExistsAsync(long projectId, string label, long? exceptId = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Quantas etapas a jornada tem hoje. E o numero que o minimo e o maximo
    /// conferem antes de gravar.
    /// </summary>
    Task<int> CountByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>A maior posicao ja usada, ou nulo quando a jornada esta vazia.</summary>
    Task<int?> LastPositionAsync(long projectId, CancellationToken cancellationToken = default);
}
