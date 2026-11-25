using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Uma linha do historico de um relato.
///
/// <para><b>Vem dos eventos</b>, e nao de uma coluna de historico. Uma coluna
/// seria uma segunda versao do mesmo fato, e as duas divergiriam no primeiro erro
/// de gravacao sem ninguem notar.</para>
///
/// <para><b>Os nomes das colunas sao os que valiam na epoca</b>, guardados no
/// evento. Buscar o nome atual faria uma coluna renomeada — ou aposentada —
/// reescrever o passado, dizendo que o relato esteve num estado que ainda nao
/// existia.</para>
/// </summary>
/// <param name="PublicId">Identificador do evento.</param>
/// <param name="Type">O que aconteceu.</param>
/// <param name="Source">
/// De onde partiu. E o que separa a leitura de quem relatou, pela pagina de
/// acompanhamento (<c>PublicPage</c>), da leitura do time (<c>Panel</c>): as duas tem o
/// mesmo tipo.
/// </param>
/// <param name="AuthorName">Quem fez. <b>Nulo</b> quando veio de fora — o relato nasce de um desconhecido — ou nos eventos anteriores a esta informacao existir.</param>
/// <param name="FromStateName">A coluna de onde saiu, so na mudanca de estado. Nulo quando o relato ainda nao tinha coluna.</param>
/// <param name="ToStateName">A coluna para onde foi, so na mudanca de estado.</param>
/// <param name="OccurredAt">Quando aconteceu, em UTC. <b>E esta a data</b>, e nao a de gravacao: as duas divergem quando houve retentativa.</param>
/// <param name="From">
/// O valor de antes, nos campos do card: o nome da prioridade (o da epoca), o nome de
/// quem estava com o card (o de agora, ou o e-mail de quem nao tem nome) ou o prazo
/// (<c>aaaa-mm-dd</c>). Nulo quando nao havia: na mudanca de responsavel, nulo quer
/// dizer ninguem, e nunca alguem sem nome.
/// </param>
/// <param name="To">O valor de depois, do mesmo jeito. Nulo quando ficou sem.</param>
/// <param name="Added">As etiquetas que entraram, com o nome da epoca. Vazia fora da mudanca de etiquetas.</param>
/// <param name="Removed">As etiquetas que sairam, com o nome da epoca.</param>
/// <param name="TitleRestored">
/// Na mudanca de titulo: verdadeiro quando o time voltou ao que quem relatou
/// escreveu. Nulo nas outras linhas.
/// </param>
public record ReportHistoryEntryViewModel(
    Guid PublicId,
    EventTypeEnum Type,
    EventSourceEnum Source,
    string? AuthorName,
    string? FromStateName,
    string? ToStateName,
    DateTime OccurredAt,
    string? From,
    string? To,
    IReadOnlyList<string> Added,
    IReadOnlyList<string> Removed,
    bool? TitleRestored);

/// <summary>
/// Um pedaco do historico, do mais novo para o mais antigo. O painel abre o historico com
/// os mais recentes e traz os de antes a pedido, em vez de ler tudo a cada card aberto.
/// </summary>
/// <param name="Items">Os eventos do pedaco, do mais novo para o mais antigo.</param>
/// <param name="HasOlder">Ha eventos antes do mais antigo deste pedaco.</param>
/// <param name="Total">Quantos eventos o historico tem ao todo, com as mesmas regras de leitura.</param>
/// <param name="ReporterReturns">Quantas voltas de quem relatou a pagina de acompanhamento ficaram de fora. Zero quando elas ja vem no pedaco.</param>
/// <param name="FirstReporterVisit">A primeira vez que quem relatou abriu o acompanhamento, para a tela separar a primeira das voltas. Nulo se nunca abriu.</param>
public record ReportHistoryPageViewModel(
    IReadOnlyList<ReportHistoryEntryViewModel> Items,
    bool HasOlder,
    int Total,
    int ReporterReturns,
    Guid? FirstReporterVisit);
