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

    /// <summary>
    /// So os eventos de mudanca de etapa publica de um relato, para quem chega
    /// <b>sem sessao</b>.
    ///
    /// <para><b>Existe separada de <see cref="ListByReportAsync"/> de proposito, e
    /// e a decisao mais importante desta interface.</b> Uma unica leitura
    /// "eventos do relato" que a pagina publica filtrasse depois funcionaria hoje e
    /// seria o vazamento de amanha: bastaria alguem acrescentar um tipo de evento e
    /// esquecer de atualizar o filtro, e comentario interno ou nome de responsavel
    /// sairiam para quem nao e do time — sem erro em lugar nenhum.</para>
    ///
    /// <para>Aqui o recorte mora na <b>consulta</b>. Tipo de evento novo nasce
    /// invisivel para fora, que e a mesma regra da lista de permissao que monta a
    /// resposta publica.</para>
    ///
    /// <para>Sem sessao a conta atual e zero, e o filtro global devolveria vazio —
    /// quem chega aqui ja provou que pode ver este relato, pelo token do link.</para>
    /// </summary>
    Task<IReadOnlyList<Event>> ListPublicStageChangesWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default);
}
