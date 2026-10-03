using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Uma etiqueta do projeto.
/// </summary>
/// <param name="PublicId">Identificador publico.</param>
/// <param name="Name">O nome.</param>
/// <param name="Color">A cor, da paleta fixa.</param>
/// <param name="CardCount">
/// Em quantos cards ela esta, arquivados inclusive. E o que a tela diz antes de
/// apagar: apagar a tira de todos eles.
/// </param>
/// <param name="CreatedAt">Quando foi criada, em UTC.</param>
public record ProjectLabelViewModel(
    Guid PublicId,
    string Name,
    CardColorEnum Color,
    int CardCount,
    DateTime CreatedAt);
