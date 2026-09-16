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
/// <param name="AuthorName">Quem fez. <b>Nulo</b> quando veio de fora — o relato nasce de um desconhecido — ou nos eventos anteriores a esta informacao existir.</param>
/// <param name="FromStateName">A coluna de onde saiu, so na mudanca de estado. Nulo quando o relato ainda nao tinha coluna.</param>
/// <param name="ToStateName">A coluna para onde foi, so na mudanca de estado.</param>
/// <param name="OccurredAt">Quando aconteceu, em UTC. <b>E esta a data</b>, e nao a de gravacao: as duas divergem quando houve retentativa.</param>
public record ReportHistoryEntryViewModel(
    Guid PublicId,
    EventTypeEnum Type,
    string? AuthorName,
    string? FromStateName,
    string? ToStateName,
    DateTime OccurredAt);
