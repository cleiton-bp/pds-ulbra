namespace Pds.Domain.Entities;

/// <summary>
/// Quantos relatos o projeto aceita em pouco tempo, por camada: de quem relata, do
/// mesmo IP, do mesmo endereco de origem e do projeto inteiro — e o intervalo minimo
/// entre dois relatos da mesma pessoa ou do mesmo IP.
///
/// <para><b>Uma linha so quando alguem salva.</b> Sem linha valem os padroes de
/// <see cref="ReportLimitsDefaults"/>, e cada valor tem o teto do sistema: o projeto
/// pode apertar ou afrouxar, mas nao desligar a protecao de todo.</para>
///
/// <para><b>Nada de IP aqui, nem em tabela nenhuma.</b> A contagem por quem relata e
/// por IP vive na memoria do processo; o banco so guarda os numeros que o projeto
/// escolheu.</para>
/// </summary>
public class ProjectReportLimits : PdsBaseEntity
{
    /// <summary>Projeto dono da configuracao. Uma linha por projeto.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>Relatos da mesma pessoa a cada dez minutos.</summary>
    public int PerReporter { get; set; } = ReportLimitsDefaults.PerReporter;

    /// <summary>Relatos do mesmo IP por hora.</summary>
    public int PerIpPerHour { get; set; } = ReportLimitsDefaults.PerIpPerHour;

    /// <summary>Relatos do mesmo endereco de origem por hora.</summary>
    public int PerOriginPerHour { get; set; } = ReportLimitsDefaults.PerOriginPerHour;

    /// <summary>Relatos do projeto inteiro por hora.</summary>
    public int PerProjectPerHour { get; set; } = ReportLimitsDefaults.PerProjectPerHour;

    /// <summary>Relatos do projeto inteiro por dia (as ultimas 24 horas).</summary>
    public int PerProjectPerDay { get; set; } = ReportLimitsDefaults.PerProjectPerDay;

    /// <summary>Segundos minimos entre dois relatos da mesma pessoa ou do mesmo IP. Zero desliga.</summary>
    public int MinIntervalSeconds { get; set; } = ReportLimitsDefaults.MinIntervalSeconds;
}
