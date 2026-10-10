using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Filters;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IReportRepository : IBaseRepository<Report>
{
    /// <summary>
    /// Este protocolo ja existe? A pergunta vale para o sistema inteiro, e nao para
    /// os projetos da sessao: quem digita o protocolo nao sabe de qual projeto o relato e,
    /// entao dois relatos de contas diferentes com o mesmo codigo levariam a pessoa
    /// ao lugar errado.
    ///
    /// <para>Por isso a consulta atravessa o filtro — e na criacao ela roda sem
    /// sessao nenhuma, quando a lista de projetos acessiveis esta vazia e o filtro nao devolveria nada.</para>
    /// </summary>
    Task<bool> TrackingCodeExistsAsync(string trackingCode, CancellationToken cancellationToken = default);

    /// <summary>
    /// O relato de um protocolo, para a consulta publica de acompanhamento.
    ///
    /// <para>Atravessa o filtro global pela mesma razao das outras leituras
    /// publicas: quem chega e quem relatou, sem sessao nenhuma, e ali a lista de projetos
    /// acessiveis esta vazia — com o filtro ligado o proprio dono do relato receberia "nao
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
    /// Uma pagina dos relatos de um projeto: do mais novo para o mais antigo, ou na
    /// ordem do quadro.
    ///
    /// <para>As duas ordens tem dois criterios de proposito. Paginacao por posicao
    /// supoe ordem total, e <c>created_at</c> sozinho nao da isso: dois relatos
    /// gravados no mesmo instante podem trocar de lugar entre uma pagina e a
    /// seguinte, e a pessoa veria um repetido enquanto o outro nunca apareceria. O
    /// Id desempata nas duas.</para>
    ///
    /// <para><paramref name="archived"/> escolhe o lado: os que estao na tela de
    /// Trabalho, ou so os arquivados — nunca os dois juntos.
    /// <paramref name="enteredSince"/>, quando vem, deixa so o que entrou na coluna
    /// a partir dali: e a regra da ultima coluna do quadro. <paramref name="after"/>,
    /// na ordem do quadro, deixa so o que vem depois daquele lugar da coluna: e o
    /// "Mostrar mais" do quadro. <paramref name="cards"/> sao os filtros da tela de
    /// Trabalho — responsavel, etiqueta, prioridade, tipo, vencidos e a busca.</para>
    ///
    /// <para><paramref name="sort"/>, na lista de sempre, troca o "mais novo primeiro"
    /// pela ordem que a pessoa escolheu: o vazio no fim, o mais novo desempatando e o
    /// Id no fim de tudo, para a pagina continuar com ordem total.</para>
    /// </summary>
    Task<IReadOnlyList<Report>> ListByProjectAsync(long projectId, ReportStateFilter filter, bool archived, ReportListOrder order, DateTime? enteredSince, BoardSpot? after, int skip, int take, ReportCardFilter cards, ReportListSort? sort = null, CancellationToken cancellationToken = default);

    /// <summary>Quantos cards o projeto tem no recorte. E o que diz se ainda ha o que carregar.</summary>
    Task<int> CountByProjectAsync(long projectId, ReportStateFilter filter, bool archived, DateTime? enteredSince, ReportCardFilter cards, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os numeros da frente do card — comentarios, anexos, se ja encerrou e se ja
    /// terminou —, numa consulta por numero para a pagina inteira, e nao uma por card.
    /// </summary>
    Task<IReadOnlyDictionary<long, CardFace>> CountFacesAsync(IReadOnlyCollection<long> reportIds, CancellationToken cancellationToken = default);

    /// <summary>
    /// Por que cada pai da pagina casou com o filtro pelas subtarefas: quantas sao de
    /// cada pessoa do filtro de responsavel, e se a busca achou o termo numa delas. So
    /// os pais com alguma; vazio sem esses dois filtros, e na leitura das subtarefas de
    /// um card.
    /// </summary>
    Task<IReadOnlyDictionary<long, SubtaskMatch>> ListSubtaskMatchesAsync(IReadOnlyCollection<long> parentIds, ReportCardFilter filter, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os relatos do projeto contados por endereco de origem, os arquivados inclusive.
    /// So o relato tem origem: o card do time fica de fora.
    /// </summary>
    Task<IReadOnlyList<ReportOriginTally>> TallyOriginsAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os relatos retidos do projeto, contados por endereco (o vazio junto com o nulo).
    /// Atravessa o filtro global, que esconde o retido de todo o resto.
    /// </summary>
    Task<IReadOnlyList<HeldOriginTally>> TallyHeldOriginsAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os relatos retidos que vieram deste endereco, rastreados, do mais antigo para o
    /// mais novo: exatamente ele, ou tambem os de baixo com
    /// <paramref name="includesSubdomains"/>. <paramref name="domain"/> nulo traz os que
    /// nao disseram de onde vieram.
    /// </summary>
    Task<List<Report>> ListHeldAsync(long projectId, string? domain, bool includesSubdomains, CancellationToken cancellationToken = default);

    /// <summary>
    /// Ha relato retido deste endereco no projeto? E o que decide avisar o time de um
    /// endereco novo uma vez so, e nao a cada relato dele. Sem sessao: quem pergunta e a
    /// entrada do relato.
    /// </summary>
    Task<bool> AnyHeldFromOriginWithoutSessionAsync(long projectId, string? origin, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os cards marcados com a origem bloqueada, rastreados: entre estes, se
    /// <paramref name="publicIds"/> vier; senao, todos os do projeto que vieram de um
    /// endereco coberto por <paramref name="blockedOriginId"/>.
    /// </summary>
    Task<List<Report>> ListBlockedOriginMarkedAsync(long projectId, IReadOnlyCollection<Guid>? publicIds, long? blockedOriginId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Apaga de vez estes cards e as subtarefas deles, com tudo que pendura neles: o
    /// contexto, as respostas, as etiquetas, os comentarios, os encerramentos, os
    /// pedidos de informacao, os anexos, os vinculos e os avisos do sino. Os eventos
    /// ficam, sem o card e sem o caminho da pagina. <b>Chamar dentro de uma
    /// transacao</b>: sao varios comandos, e pela metade sobraria um card sem metade
    /// do que era dele.
    /// </summary>
    Task<ReportPurge> PurgeAsync(long projectId, IReadOnlyCollection<long> reportIds, CancellationToken cancellationToken = default);

    /// <summary>
    /// As subtarefas de um card com este instante no arquivo — nulo traz as que estao
    /// fora dele —, rastreadas: e o que arquivar e desarquivar o pai levam junto.
    /// </summary>
    Task<List<Report>> ListSubtasksArchivedAtAsync(long parentId, DateTime? archivedAt, CancellationToken cancellationToken = default);

    /// <summary>Dos cards pedidos, os que ja terminaram — a mesma regra do prazo e do bloqueio.</summary>
    Task<IReadOnlySet<long>> ListFinishedAsync(IReadOnlyCollection<long> reportIds, CancellationToken cancellationToken = default);

    /// <summary>O lugar do card na ordem do backlog: a lista (a sprint, ou nenhuma) e o numero.</summary>
    Task<BacklogSpot?> FindBacklogSpotAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>O lugar do vizinho de baixo na mesma lista do backlog, ou nulo no fim dela.</summary>
    Task<long?> FindBacklogRankBelowAsync(long projectId, long? sprintId, long rank, long anchorId, long exceptId, CancellationToken cancellationToken = default);

    /// <summary>O menor (topo) ou o maior (fim) lugar de uma lista do backlog, sem o card que se move.</summary>
    Task<long?> FindBacklogEdgeRankAsync(long projectId, long? sprintId, bool top, long exceptId, CancellationToken cancellationToken = default);

    /// <summary>Renumera uma lista do backlog com a folga inteira, na ordem em que esta.</summary>
    Task RenumberBacklogAsync(long projectId, long? sprintId, long exceptId, CancellationToken cancellationToken = default);

    /// <summary>Todas as subtarefas de um card, rastreadas — elas acompanham a sprint do pai.</summary>
    Task<List<Report>> ListSubtasksAsync(long parentId, CancellationToken cancellationToken = default);

    /// <summary>Os cards de uma sprint, sem as subtarefas e sem o arquivo, rastreados, na ordem dela.</summary>
    Task<List<Report>> ListSprintCardsAsync(long sprintId, CancellationToken cancellationToken = default);

    /// <summary>Os cards arquivados de uma sprint, sem as subtarefas, rastreados — a sprint apagada os solta.</summary>
    Task<List<Report>> ListArchivedSprintCardsAsync(long sprintId, CancellationToken cancellationToken = default);

    /// <summary>Os numeros de cada sprint: cards, os que terminaram, e os pontos.</summary>
    Task<IReadOnlyDictionary<long, SprintStats>> CountSprintsAsync(IReadOnlyCollection<long> sprintIds, CancellationToken cancellationToken = default);

    /// <summary>O card que vai ser pai de uma subtarefa, sem rastreio. Nulo quando nao e do projeto.</summary>
    Task<Report?> FindParentAsync(long projectId, Guid parentPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Trava a ordem do quadro do projeto ate a transacao atual terminar.
    ///
    /// <para><b>E ela que deixa por um card entre dois sem errar o lugar.</b> Quem
    /// solta le os vizinhos e escolhe um numero no meio — e, sem folga, renumera a
    /// coluna. Dois soltando juntos leriam os mesmos vizinhos, ou um leria a coluna
    /// no meio da renumeracao do outro.</para>
    ///
    /// <para>So vale dentro de uma transacao (<c>InTransactionAsync</c>), como as
    /// outras travas. O card que chega pelo topo nao passa por ela: o topo vem do
    /// contador do projeto.</para>
    /// </summary>
    Task LockBoardAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>Onde um card do projeto esta no quadro, sem carrega-lo. Nulo se ele nao existe aqui.</summary>
    Task<BoardSpot?> FindBoardSpotAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// O lugar do card logo abaixo de um outro na mesma coluna, na ordem do quadro
    /// (o lugar, e o Id para desempatar). Nulo quando nao ha card abaixo.
    /// <paramref name="exceptId"/> fica de fora: e o card que esta sendo solto.
    /// </summary>
    Task<long?> FindRankBelowAsync(long projectId, long? stateId, long rank, long anchorId, long exceptId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Renumera a coluna com a folga inteira entre vizinhos, na ordem em que esta.
    /// <paramref name="exceptId"/> fica de fora: e o card que esta sendo solto, e ganha
    /// o lugar dele em seguida.
    /// </summary>
    Task RenumberColumnAsync(long projectId, long? stateId, long exceptId, CancellationToken cancellationToken = default);

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
    ///
    /// <para>Com <paramref name="cards"/>, conta so o que passa nos filtros da tela de
    /// Trabalho: o numero de cada coluna e o que a tela mostra.</para>
    /// </summary>
    Task<IReadOnlyList<ReportStateCount>> CountByStateAsync(long projectId, ReportCardFilter cards, CancellationToken cancellationToken = default);

    /// <summary>
    /// Um relato do projeto, com o contexto junto.
    ///
    /// <para>O projeto entra na condicao, e nao so o identificador do relato: sem
    /// ele, um relato de outro projeto que a pessoa enxerga abriria por baixo do
    /// endereco deste — e a tela diria que ele veio de onde nao veio, para alguem que
    /// talvez seja so membro de um dos dois.</para>
    /// </summary>
    Task<Report?> GetByPublicIdWithContextsAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Trava os campos do card (titulo, responsavel, prioridade, etiquetas, prazo) ate
    /// a transacao atual terminar.
    ///
    /// <para><b>E ela que faz dois pedidos ao mesmo card contarem um depois do
    /// outro.</b> Quem chama trava e so entao le o card: o segundo pedido espera o
    /// primeiro gravar e ja ve o que ele deixou.</para>
    ///
    /// <para>So vale dentro de uma transacao (<c>InTransactionAsync</c>), como a da
    /// cota de anexos. O card que nao existe neste projeto nao trava nada — a busca
    /// que vem em seguida e que recusa.</para>
    /// </summary>
    Task LockCardFieldsAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default);

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
