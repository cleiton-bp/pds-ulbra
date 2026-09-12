using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IReportRepository : IBaseRepository<Report>
{
    /// <summary>
    /// Este protocolo ja existe? A pergunta vale para o sistema inteiro, e nao para
    /// a conta atual: quem digita o protocolo nao sabe de qual projeto o relato e,
    /// entao dois relatos de contas diferentes com o mesmo codigo levariam a pessoa
    /// ao lugar errado.
    ///
    /// <para>Por isso a consulta atravessa o filtro — e na criacao ela roda sem
    /// sessao nenhuma, quando a conta atual e zero e o filtro nao devolveria nada.</para>
    /// </summary>
    Task<bool> TrackingCodeExistsAsync(string trackingCode, CancellationToken cancellationToken = default);

    /// <summary>
    /// O relato de um protocolo, para a consulta publica de acompanhamento.
    ///
    /// <para>Atravessa o filtro global pela mesma razao das outras leituras
    /// publicas: quem chega e quem relatou, sem sessao nenhuma, e ali a conta atual
    /// e zero — com o filtro ligado o proprio dono do relato receberia "nao
    /// encontrado".</para>
    ///
    /// <para><b>Busca pelo protocolo, e a conferencia do token vem depois</b>, no
    /// servico. E o desenho de sempre: identifica-se pelo publico e confere-se pelo
    /// segredo. Buscar pelo hash do token resolveria numa consulta so, mas deixaria
    /// a comparacao de segredo dentro do banco, onde ela nao e em tempo constante.</para>
    ///
    /// <para>Inclui o relato apagado logicamente de proposito: a linha sai da lista
    /// do painel, mas o link continua na mao de quem relatou, e responder "este
    /// relato nunca existiu" a quem o escreveu seria mentira.</para>
    /// </summary>
    Task<Report?> FindByTrackingCodeWithoutSessionAsync(string trackingCode, CancellationToken cancellationToken = default);

    /// <summary>
    /// Uma pagina dos relatos de um projeto, do mais novo para o mais antigo.
    ///
    /// <para>A ordem tem dois criterios de proposito. Paginacao por posicao supoe
    /// ordem total, e <c>created_at</c> sozinho nao da isso: dois relatos gravados
    /// no mesmo instante podem trocar de lugar entre uma pagina e a seguinte, e a
    /// pessoa veria um repetido enquanto o outro nunca apareceria.</para>
    /// </summary>
    Task<IReadOnlyList<Report>> ListByProjectAsync(long projectId, int skip, int take, CancellationToken cancellationToken = default);

    /// <summary>Quantos relatos o projeto tem. E o que diz se ainda ha o que carregar.</summary>
    Task<int> CountByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Um relato do projeto, com o contexto junto.
    ///
    /// <para>O projeto entra na condicao, e nao so o identificador do relato: sem
    /// ele, um relato da mesma conta abriria por baixo do endereco de outro projeto
    /// — e a tela diria que ele veio de onde nao veio.</para>
    /// </summary>
    Task<Report?> GetByPublicIdWithContextsAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default);
}
