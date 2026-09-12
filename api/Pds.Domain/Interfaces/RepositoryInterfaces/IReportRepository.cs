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
