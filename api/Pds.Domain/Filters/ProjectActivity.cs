namespace Pds.Domain.Filters;

/// <summary>
/// O movimento de um projeto, lido de uma vez para a lista inteira.
/// </summary>
/// <param name="ProjectId">Chave interna do projeto.</param>
/// <param name="LastReportReceivedAt">
/// Quando chegou o relato mais recente vindo de fora, pela ferramenta. Nulo se o site
/// ainda nao mandou nenhum. O card do time nao conta: ele nasce no painel, e nao diz
/// nada sobre a instalacao.
/// </param>
/// <param name="LastActivityAt">Ultima mudanca em qualquer card do projeto, de fora ou do time. Nulo sem card nenhum.</param>
public record ProjectActivity(
    long ProjectId,
    DateTime? LastReportReceivedAt,
    DateTime? LastActivityAt);
