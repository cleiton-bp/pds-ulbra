namespace Pds.Domain.ViewModels;

/// <summary>
/// Endereco autorizado como aparece na listagem.
/// </summary>
/// <param name="PublicId">Identificador publico. E o que vai na URL para remover.</param>
/// <param name="Domain">O dominio ja normalizado, do jeito que e comparado.</param>
/// <param name="AllowsSubdomains">Vale tambem para o que estiver abaixo do dominio.</param>
/// <param name="CreatedAt">Quando o endereco foi autorizado, em UTC.</param>
public record ProjectOriginViewModel(
    Guid PublicId,
    string Domain,
    bool AllowsSubdomains,
    DateTime CreatedAt);

/// <summary>
/// Um endereco que ja mandou relatos ao projeto, como a tela de Dominios mostra.
/// </summary>
/// <param name="Domain">O endereco, em minusculo, como foi gravado no relato.</param>
/// <param name="ReportCount">Quantos relatos vieram de la, os arquivados inclusive.</param>
/// <param name="LastReportAt">Quando chegou o ultimo, em UTC.</param>
/// <param name="Status">Se o projeto autoriza, bloqueia, ou nenhum dos dois.</param>
/// <param name="MarkedCount">
/// Com o endereco bloqueado, quantos relatos dele estao marcados com a origem
/// bloqueada — os que o time ainda nao decidiu manter. Zero fora do bloqueio.
/// </param>
/// <param name="BlockedOriginId">
/// A linha de bloqueio que vale para ele, quando bloqueado — e por ela que a tela age
/// sobre os marcados e desbloqueia. Nula fora do bloqueio.
/// </param>
public record ObservedOriginViewModel(
    string Domain,
    int ReportCount,
    DateTime LastReportAt,
    Pds.Domain.Enums.ObservedOriginStatusEnum Status,
    int MarkedCount,
    Guid? BlockedOriginId);

/// <summary>
/// Endereco bloqueado como aparece na listagem.
/// </summary>
/// <param name="PublicId">Identificador publico. E o que vai na URL para desbloquear.</param>
/// <param name="Domain">O dominio ja normalizado, do jeito que e comparado.</param>
/// <param name="IncludesSubdomains">Vale tambem para o que estiver abaixo do dominio.</param>
/// <param name="BlockedAt">Quando foi bloqueado, em UTC.</param>
/// <param name="BlockedByName">Quem bloqueou; nulo quando a conta da pessoa foi esvaziada.</param>
/// <param name="MarkedCount">
/// Quantos relatos vindos de la estao marcados com a origem bloqueada — os que o time
/// ainda nao decidiu manter, ou apagar.
/// </param>
public record ProjectBlockedOriginViewModel(
    Guid PublicId,
    string Domain,
    bool IncludesSubdomains,
    DateTime BlockedAt,
    string? BlockedByName,
    int MarkedCount);
