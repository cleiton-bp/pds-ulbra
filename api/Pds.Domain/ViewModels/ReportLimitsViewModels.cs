namespace Pds.Domain.ViewModels;

/// <summary>
/// Os limites de relato do projeto: os que valem hoje, os de fabrica e os tetos do
/// sistema — a tela mostra os tres, e confere antes de mandar.
/// </summary>
/// <param name="Values">Os que valem hoje: os salvos, ou os de fabrica.</param>
/// <param name="Defaults">Os de fabrica.</param>
/// <param name="Ceilings">O maior valor aceito em cada um (dez vezes o de fabrica).</param>
/// <param name="PauseMinutes">Quantos minutos dura a pausa no dobro de um limite.</param>
public record ReportLimitsViewModel(
    ReportLimitValuesViewModel Values,
    ReportLimitValuesViewModel Defaults,
    ReportLimitValuesViewModel Ceilings,
    int PauseMinutes);

/// <summary>Um conjunto de limites.</summary>
public record ReportLimitValuesViewModel(
    int PerReporter,
    int PerIpPerHour,
    int PerOriginPerHour,
    int PerProjectPerHour,
    int PerProjectPerDay,
    int MinIntervalSeconds);

/// <summary>Os relatos retidos de um endereco, em "Aguardando liberacao".</summary>
/// <param name="Domain">O endereco; nulo para os que nao disseram de onde vieram.</param>
/// <param name="ReportCount">Quantos relatos dele estao retidos.</param>
/// <param name="LastReportAt">Quando chegou o mais novo, em UTC.</param>
public record HeldOriginViewModel(string? Domain, int ReportCount, DateTime LastReportAt);

/// <summary>O que liberar ou apagar os retidos de um endereco fez.</summary>
/// <param name="Reports">Quantos relatos foram liberados, ou apagados.</param>
public record HeldOriginReportsResultViewModel(int Reports);
