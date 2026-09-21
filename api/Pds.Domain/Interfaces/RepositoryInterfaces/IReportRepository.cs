using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Filters;

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
    Task<IReadOnlyList<Report>> ListByProjectAsync(long projectId, ReportStateFilter filter, int skip, int take, CancellationToken cancellationToken = default);

    /// <summary>Quantos relatos o projeto tem. E o que diz se ainda ha o que carregar.</summary>
    Task<int> CountByProjectAsync(long projectId, ReportStateFilter filter, CancellationToken cancellationToken = default);

    /// <summary>
    /// Quantos relatos ha em cada coluna da fila, mais a linha dos que ainda nao
    /// tem lugar nela.
    ///
    /// <para>Sai uma linha por estado do projeto, <b>inclusive as de zero</b>: a
    /// tela precisa mostrar a coluna vazia, senao ela some do filtro no dia em que
    /// o ultimo relato dela e movido, e quem olha acha que a coluna deixou de
    /// existir.</para>
    ///
    /// <para>E pergunta separada da lista de proposito. A lista traz uma pagina; a
    /// contagem varre tudo. Na mesma consulta, ou a contagem mente ou a lista
    /// deixa de paginar.</para>
    /// </summary>
    Task<IReadOnlyList<ReportStateCount>> CountByStateAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Um relato do projeto, com o contexto junto.
    ///
    /// <para>O projeto entra na condicao, e nao so o identificador do relato: sem
    /// ele, um relato da mesma conta abriria por baixo do endereco de outro projeto
    /// — e a tela diria que ele veio de onde nao veio.</para>
    /// </summary>
    Task<Report?> GetByPublicIdWithContextsAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Um relato pelo identificador publico, <b>sem sessao</b>, com o projeto e a
    /// coluna atual carregados.
    ///
    /// <para>Quem chama e o consumidor da fila, que nao tem requisicao nem conta —
    /// e precisa do projeto para a versao do mapa e da coluna para saber o que
    /// traduzir.</para>
    /// </summary>
    Task<Report?> FindByPublicIdWithoutSessionAsync(Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os relatos de um codigo pessoal, do mais novo para o mais antigo — para quem
    /// chega <b>sem sessao</b>.
    ///
    /// <para><b>Sem o autor e sem o texto inteiro carregados</b>, e de proposito: o
    /// que sai daqui vira uma lista de resumos, e o campo que nao vem do banco nao
    /// tem como escapar numa resposta.</para>
    /// </summary>
    Task<IReadOnlyList<Report>> ListByReporterCodeWithoutSessionAsync(long reporterCodeId, int limit, CancellationToken cancellationToken = default);

    /// <summary>
    /// A fila de moderacao de um projeto, num estado so.
    ///
    /// <para>Do <b>mais antigo para o mais novo</b>, ao contrario de toda outra
    /// lista do painel: fila que se le de tras para frente deixa o primeiro que
    /// chegou esperando para sempre.</para>
    /// </summary>
    Task<IReadOnlyList<Report>> ListByModerationStateAsync(long projectId, ReportModerationStateEnum state, int limit, CancellationToken cancellationToken = default);

    /// <summary>Quantos relatos do projeto estao neste estado de moderacao.</summary>
    Task<int> CountByModerationStateAsync(long projectId, ReportModerationStateEnum state, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os relatos ja liberados de um projeto, para quem nao tem sessao nenhuma.
    ///
    /// <para><b>A condicao de estar liberado esta na consulta</b>, e nao numa
    /// conferencia depois: o relato pendente nunca chega a sair daqui, entao nao ha
    /// como ele aparecer na lista por alguem ter esquecido de olhar a coluna.</para>
    /// </summary>
    Task<IReadOnlyList<Report>> ListPublishedWithoutSessionAsync(long projectId, int limit, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os relatos cuja espera ja venceu e ninguem aplicou.
    ///
    /// <para><b>E a rede embaixo da fila, e nao um substituto dela.</b> Roda na
    /// subida da aplicacao: o que espera dentro do broker mora no armazenamento
    /// local do no, sem replicacao, e sem isto perder o no deixaria aqueles relatos
    /// invisiveis para sempre para quem os escreveu.</para>
    /// </summary>
    Task<IReadOnlyList<Guid>> ListOverduePublicStageWithoutSessionAsync(DateTime now, CancellationToken cancellationToken = default);
}
