namespace Pds.Domain.Enums;

/// <summary>Por que a entrada recusou o relato com 429.</summary>
public enum ReportRefusalReasonEnum
{
    /// <summary>Cedo demais depois do anterior, da mesma pessoa ou do mesmo IP. Sem desafio: e esperar.</summary>
    TooSoon,

    /// <summary>Passou de um limite: o relato entra se vier de novo com o desafio resolvido.</summary>
    Challenge,

    /// <summary>Chegou ao dobro de um limite: os envios daquela camada estao pausados.</summary>
    Paused,
}
