using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Uma prioridade do projeto, como a Configuracao e o card a leem.
/// </summary>
/// <param name="PublicId">Identificador publico.</param>
/// <param name="Name">O nome que o time deu.</param>
/// <param name="Color">A cor, da paleta fixa.</param>
/// <param name="Position">A ordem, da menos para a mais urgente.</param>
/// <param name="IsActive">Falso quando foi aposentada: continua nos cards que a tem, e nao e mais oferecida.</param>
/// <param name="CreatedAt">Quando foi criada, em UTC.</param>
public record ProjectPriorityViewModel(
    Guid PublicId,
    string Name,
    CardColorEnum Color,
    int Position,
    bool IsActive,
    DateTime CreatedAt);
