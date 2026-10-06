namespace Pds.Domain.Dtos;

/// <summary>As preferencias de aviso da pessoa, gravadas inteiras.</summary>
public class SaveNotificationSettingsDto
{
    /// <summary>
    /// Receber e-mail quando alguem do time a escolhe como responsavel por um card.
    /// Obrigatorio. O aviso no sino chega de qualquer jeito.
    /// </summary>
    /// <example>true</example>
    public bool? AssignmentByEmail { get; set; }
}
