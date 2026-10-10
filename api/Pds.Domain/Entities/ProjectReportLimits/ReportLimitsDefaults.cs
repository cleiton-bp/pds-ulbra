namespace Pds.Domain.Entities;

/// <summary>
/// Os limites de fabrica da entrada de relatos, os tetos do sistema e as janelas.
///
/// <para><b>Os padroes seguram rajada sem atrapalhar uso de verdade.</b> Ninguem
/// relata cinco defeitos diferentes em dez minutos sem estar testando; vinte por hora
/// do mesmo IP ainda cabe um escritorio inteiro atras de um roteador so.</para>
///
/// <para><b>O teto e dez vezes o padrao.</b> Afrouxar e escolha do projeto, mas sem
/// teto um numero enorme desligaria a protecao — e quem paga a enxurrada e o banco de
/// todos.</para>
/// </summary>
public static class ReportLimitsDefaults
{
    public const int PerReporter = 5;
    public const int PerIpPerHour = 20;
    public const int PerOriginPerHour = 200;
    public const int PerProjectPerHour = 300;
    public const int PerProjectPerDay = 2000;
    public const int MinIntervalSeconds = 30;

    /// <summary>Quantas vezes o padrao cabe no teto de cada valor.</summary>
    public const int CeilingFactor = 10;

    public const int MaxPerReporter = PerReporter * CeilingFactor;
    public const int MaxPerIpPerHour = PerIpPerHour * CeilingFactor;
    public const int MaxPerOriginPerHour = PerOriginPerHour * CeilingFactor;
    public const int MaxPerProjectPerHour = PerProjectPerHour * CeilingFactor;
    public const int MaxPerProjectPerDay = PerProjectPerDay * CeilingFactor;
    public const int MaxMinIntervalSeconds = MinIntervalSeconds * CeilingFactor;

    /// <summary>A janela da contagem por quem relata.</summary>
    public static readonly TimeSpan ReporterWindow = TimeSpan.FromMinutes(10);

    /// <summary>A janela das contagens por IP, por endereco e por projeto (a da hora).</summary>
    public static readonly TimeSpan HourWindow = TimeSpan.FromHours(1);

    /// <summary>A janela do limite diario do projeto.</summary>
    public static readonly TimeSpan DayWindow = TimeSpan.FromDays(1);

    /// <summary>
    /// Quanto dura a pausa de quem chega ao dobro de um limite. Quinze minutos esfriam
    /// uma rajada automatica e ainda deixam quem errou a mao voltar no mesmo dia.
    /// </summary>
    public static readonly TimeSpan Pause = TimeSpan.FromMinutes(15);

    /// <summary>Em quantas vezes o limite a conta deixa de pedir o desafio e pausa.</summary>
    public const int PauseFactor = 2;
}
