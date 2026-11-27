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
    /// <para>Inteiro, para quem le a rota de sempre. O painel le aos pedacos, por
    /// <see cref="ListHistoryPageAsync"/>.</para>
    ///
    /// <para><b>Das leituras do time, so a primeira</b> — a unica que o painel grava hoje.
    /// As de depois, de quando cada abertura gravava, continuam na tabela, que nao se
    /// apaga, mas nao viajam a cada card aberto. As de quem relatou vem todas.</para>
    /// </summary>
    Task<IReadOnlyList<Event>> ListByReportAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Um pedaco do historico, do mais novo para o mais antigo: o painel mostra os mais
    /// recentes ao abrir o historico e traz os de antes a pedido.
    ///
    /// <para><b>Pelo ponto, e nao pela pagina</b>: <paramref name="beforePublicId"/> e o
    /// evento mais antigo que a tela ja tem, e vem o que aconteceu antes dele, por
    /// (<c>OccurredAt</c>, <c>Id</c>). Evento novo chegando enquanto a pessoa le nao repete
    /// nem pula nenhum.</para>
    ///
    /// <para><b>As mesmas leituras da rota inteira</b>: do time, so a primeira. De quem
    /// relatou, so a primeira, e as voltas com <paramref name="comVoltas"/>. A contagem e
    /// a primeira visita vem junto, para a tela dizer quantas faltam e qual leitura e a
    /// primeira mesmo antes de chegar nela.</para>
    ///
    /// <para>Nulo quando o ponto nao e um evento deste relato.</para>
    /// </summary>
    Task<HistoryPage?> ListHistoryPageAsync(long reportId, Guid? beforePublicId, int limit, bool comVoltas, CancellationToken cancellationToken = default);

    /// <summary>Se o time ja abriu o relato pelo painel alguma vez.</summary>
    Task<bool> AnyPanelViewAsync(long reportId, CancellationToken cancellationToken = default);

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
    /// <para>Sem sessao a lista de projetos acessiveis esta vazia, e o filtro global devolveria vazio —
    /// quem chega aqui ja provou que pode ver este relato, pelo token do link.</para>
    /// </summary>
    Task<IReadOnlyList<Event>> ListPublicStageChangesWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Quantos e-mails de convite o projeto pediu desde um momento — envios e
    /// reenvios. E a contagem do limite por hora. Passa pelo filtro de acesso: quem
    /// conta e o administrador, na propria sessao.
    /// </summary>
    Task<int> CountInvitationEmailsSinceAsync(long projectId, DateTime since, CancellationToken cancellationToken = default);

    /// <summary>
    /// Quantos e-mails de convite a conta pediu desde um momento, somando todos os projetos
    /// dela. E a contagem do limite por conta, ao lado do limite por projeto.
    /// </summary>
    Task<int> CountAccountInvitationEmailsSinceAsync(long accountId, DateTime since, CancellationToken cancellationToken = default);

    /// <summary>
    /// As colunas em que algum card ja entrou ou de que ja saiu, pelos movimentos gravados.
    /// A coluna que nunca aparece aqui nunca recebeu card.
    /// </summary>
    Task<IReadOnlyList<Guid>> ListStatesEverEnteredAsync(long projectId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Um pedaco do historico: os eventos do mais novo para o mais antigo, se ha mais antigos,
/// quantos sao ao todo, quantas voltas de quem relatou ficaram de fora e qual foi a
/// primeira visita dela.
/// </summary>
public record HistoryPage(
    IReadOnlyList<Event> Items,
    bool HasOlder,
    int Total,
    int ReporterReturns,
    Guid? FirstReporterVisit);
