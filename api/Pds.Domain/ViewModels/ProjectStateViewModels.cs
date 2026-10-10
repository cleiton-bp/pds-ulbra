namespace Pds.Domain.ViewModels;

/// <summary>
/// Um estado da fila de trabalho como aparece na listagem.
/// </summary>
/// <param name="PublicId">Identificador publico. E o que vai na URL para renomear, aposentar ou reordenar.</param>
/// <param name="Name">O nome que o time deu.</param>
/// <param name="Position">A ordem na fila, contada a partir de zero.</param>
/// <param name="IsActive">Falso quando o estado foi aposentado: ele continua no historico, mas nao recebe relato novo.</param>
/// <param name="CreatedAt">Quando o estado foi criado, em UTC.</param>
public record ProjectStateViewModel(
    Guid PublicId,
    string Name,
    int Position,
    bool IsActive,
    DateTime CreatedAt);
