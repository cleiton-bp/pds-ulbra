namespace Pds.Domain.Enums;

/// <summary>O que aconteceu com a pessoa avisada.</summary>
public enum NotificationKindEnum
{
    /// <summary>Alguem do time a mencionou num comentario interno.</summary>
    Mention,

    /// <summary>Alguem do time a escolheu como responsavel por um card.</summary>
    Assignment,
}
