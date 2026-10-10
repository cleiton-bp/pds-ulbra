namespace Pds.Domain.Dtos;

/// <summary>
/// Os limites de relato do projeto, inteiros. Cada valor vai de 1 ao teto do sistema
/// (dez vezes o padrao); o intervalo minimo vai de 0 (desligado) ao teto.
/// </summary>
public class ReportLimitsDto
{
    /// <summary>Relatos da mesma pessoa a cada dez minutos. Padrao 5.</summary>
    /// <example>5</example>
    public int? PerReporter { get; set; }

    /// <summary>Relatos do mesmo IP por hora. Padrao 20.</summary>
    /// <example>20</example>
    public int? PerIpPerHour { get; set; }

    /// <summary>Relatos do mesmo endereco de origem por hora. Padrao 200.</summary>
    /// <example>200</example>
    public int? PerOriginPerHour { get; set; }

    /// <summary>Relatos do projeto inteiro por hora. Padrao 300.</summary>
    /// <example>300</example>
    public int? PerProjectPerHour { get; set; }

    /// <summary>Relatos do projeto inteiro por dia. Padrao 2000.</summary>
    /// <example>2000</example>
    public int? PerProjectPerDay { get; set; }

    /// <summary>Segundos minimos entre dois relatos da mesma pessoa ou do mesmo IP. Padrao 30; zero desliga.</summary>
    /// <example>30</example>
    public int? MinIntervalSeconds { get; set; }
}

/// <summary>Os relatos retidos de um endereco, para liberar ou apagar sem mexer nas listas.</summary>
public class HeldOriginReportsDto
{
    /// <summary>
    /// O endereco, como "Aguardando liberacao" mostra. <b>Nulo</b> para os relatos que
    /// nao disseram de onde vieram.
    /// </summary>
    /// <example>loja.exemplo.com</example>
    public string? Domain { get; set; }
}
