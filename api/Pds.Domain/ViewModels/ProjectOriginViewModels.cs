namespace Pds.Domain.ViewModels;

/// <summary>
/// Endereco autorizado como aparece na listagem.
/// </summary>
/// <param name="PublicId">Identificador publico. E o que vai na URL para remover.</param>
/// <param name="Domain">O dominio ja normalizado, do jeito que e comparado.</param>
/// <param name="AllowsSubdomains">Vale tambem para o que estiver abaixo do dominio.</param>
/// <param name="CreatedAt">Quando o endereco foi autorizado, em UTC.</param>
public record ProjectOriginViewModel(
    Guid PublicId,
    string Domain,
    bool AllowsSubdomains,
    DateTime CreatedAt);
