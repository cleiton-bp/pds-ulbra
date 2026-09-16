using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>
/// Unico repositorio do sistema que nao herda de <c>IBaseRepository</c>, e a
/// interface diz por que: a tabela so cresce. Nao ha <c>Update</c> nem
/// <c>SoftDelete</c> para oferecer, e oferecer assinaturas que ninguem pode chamar
/// seria convidar alguem a chama-las.
/// </summary>
public interface IEventRepository
{
    Task<Event> AddAsync(Event entity, CancellationToken cancellationToken = default);

    /// <summary>
    /// Tudo que aconteceu com um relato, do mais antigo para o mais novo.
    ///
    /// <para>E daqui que sai o historico da tela — <b>montado a partir dos
    /// eventos, e nao de uma coluna propria</b>. Uma coluna de historico seria uma
    /// segunda versao do mesmo fato, e as duas divergiriam no primeiro erro de
    /// gravacao sem ninguem notar.</para>
    ///
    /// <para>Nao ha paginacao, e e uma decisao: o historico de um relato e curto
    /// por natureza, e quebra-lo em paginas esconderia o comeco da conversa
    /// justamente de quem abriu para entender o caso.</para>
    /// </summary>
    Task<IReadOnlyList<Event>> ListByReportAsync(long reportId, CancellationToken cancellationToken = default);
}
