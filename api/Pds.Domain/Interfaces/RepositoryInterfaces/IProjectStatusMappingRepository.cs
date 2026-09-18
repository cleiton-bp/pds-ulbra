using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectStatusMappingRepository : IBaseRepository<ProjectStatusMapping>
{
    /// <summary>
    /// O mapa inteiro de uma versao. Devolve vazio quando aquela versao nao ligou
    /// nada — que e um resultado legitimo, e nao ausencia de dado.
    /// </summary>
    Task<IReadOnlyList<ProjectStatusMapping>> ListByVersionAsync(long projectId, int version, CancellationToken cancellationToken = default);

    /// <summary>
    /// Alguma ligacao da versao que vale aponta para esta etapa publica?
    ///
    /// <para>E a pergunta que a remocao de etapa faz antes de remover: tirar uma
    /// etapa que ainda recebe estado abriria um buraco silencioso na jornada — os
    /// relatos daqueles estados parariam de andar do lado de fora sem nenhum aviso,
    /// e o mapa continuaria parecendo completo.</para>
    /// </summary>
    Task<bool> AnyUsingStageAsync(long projectPublicStageId, int version, CancellationToken cancellationToken = default);

    /// <summary>
    /// O mapa de uma versao, para quem chega <b>sem sessao</b>. E a leitura que a
    /// pagina de acompanhamento vai fazer: sem sessao a conta atual e zero, e o
    /// filtro que protege o painel devolveria vazio para o proprio dono.
    /// </summary>
    Task<IReadOnlyList<ProjectStatusMapping>> ListByVersionWithoutSessionAsync(long projectId, int version, CancellationToken cancellationToken = default);
}
