namespace Pds.Domain.Enums;

/// <summary>
/// O que aconteceu. A lista cresce conforme o produto anda, e e por isso que o
/// resto do evento vive num campo livre: tipo novo entra sem migracao.
///
/// No banco vira texto em snake_case (report_created, report_viewed).
/// </summary>
public enum EventTypeEnum
{
    /// <summary>Um relato entrou.</summary>
    ReportCreated,

    /// <summary>Alguem abriu o acompanhamento de um relato.</summary>
    ReportViewed,
}
