using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Chave como aparece na listagem.
/// </summary>
/// <param name="PublicId">Identificador publico da chave.</param>
/// <param name="Type">Publica ou secreta.</param>
/// <param name="Value">
/// Valor da chave. Preenchido na publica e <b>sempre nulo</b> na secreta — nao por
/// filtro de tela, mas porque o banco nao tem o valor da secreta para devolver.
/// </param>
/// <param name="Prefix">Primeiros caracteres, para identificar a chave na lista sem revela-la.</param>
/// <param name="IsActive">A chave vale enquanto nao foi revogada.</param>
/// <param name="CreatedAt">Geracao da chave, em UTC.</param>
/// <param name="RevokedAt">Quando deixou de valer, em UTC. Nulo enquanto vale.</param>
/// <param name="LastUsedAt">Ultimo uso, em UTC. Ajuda a saber se da para revogar sem quebrar nada.</param>
public record ProjectKeyViewModel(
    Guid PublicId,
    ProjectKeyTypeEnum Type,
    string? Value,
    string Prefix,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? RevokedAt,
    DateTime? LastUsedAt);

/// <summary>
/// Chave secreta no momento em que nasce, com o valor completo. Devolvida uma
/// unica vez; a partir da proxima requisicao so existe o hash.
/// </summary>
/// <param name="PublicId">Identificador publico da chave.</param>
/// <param name="Value">O valor completo. Guarde agora: nenhuma rota consegue revela-lo de novo.</param>
/// <param name="Prefix">Primeiros caracteres, que continuarao aparecendo na listagem.</param>
/// <param name="CreatedAt">Geracao da chave, em UTC.</param>
public record RevealedSecretKeyViewModel(
    Guid PublicId,
    string Value,
    string Prefix,
    DateTime CreatedAt);
