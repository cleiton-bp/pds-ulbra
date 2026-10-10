namespace Pds.Domain.Enums;

/// <summary>O que aconteceu com a pessoa avisada.</summary>
public enum NotificationKindEnum
{
    /// <summary>Alguem do time a mencionou num comentario interno.</summary>
    Mention,

    /// <summary>Alguem do time a escolheu como responsavel por um card.</summary>
    Assignment,

    /// <summary>
    /// Um endereco fora da lista de autorizados mandou relato, que ficou retido: permitir
    /// ou bloquear? Um por endereco enquanto houver retido dele, para quem administra.
    /// </summary>
    OriginPending,

    /// <summary>
    /// Relatos demais em pouco tempo: os envios de uma camada (pessoa, IP, endereco ou o
    /// projeto) ficaram pausados. Um por pausa, para quem administra.
    /// </summary>
    ReportsPaused,
}
