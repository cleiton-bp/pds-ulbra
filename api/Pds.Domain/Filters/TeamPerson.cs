namespace Pds.Domain.Filters;

/// <summary>
/// Alguem do time de um projeto, so pelas duas chaves: e tudo o que o time decide —
/// quem pode ser responsavel, quem pode ser mencionado e se o responsavel de um card
/// continua no time.
/// </summary>
/// <param name="Id">A pessoa por dentro: a chave que o card e o aviso guardam.</param>
/// <param name="PublicId">A pessoa como o painel a conhece: a do filtro, da escolha e da mencao.</param>
public record TeamPerson(long Id, Guid PublicId);
