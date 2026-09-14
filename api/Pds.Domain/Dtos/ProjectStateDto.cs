namespace Pds.Domain.Dtos;

/// <summary>
/// Um estado novo na fila de trabalho. O projeto vem da rota, nunca do corpo.
/// </summary>
public class CreateProjectStateDto
{
    /// <summary>
    /// Como o time chama esta parte do trabalho. Entra no fim da fila; a posicao
    /// se ajusta depois, arrastando.
    /// </summary>
    /// <example>Triagem</example>
    public string? Name { get; set; }
}

/// <summary>
/// Novo nome de um estado que ja existe.
/// </summary>
public class RenameProjectStateDto
{
    /// <summary>
    /// O nome passa a valer de agora em diante. O historico nao muda: cada evento
    /// guarda o nome que valia quando aconteceu.
    /// </summary>
    /// <example>Corrigindo</example>
    public string? Name { get; set; }
}

/// <summary>
/// A fila inteira, na ordem nova.
/// </summary>
public class ReorderProjectStatesDto
{
    /// <summary>
    /// Os identificadores publicos dos estados, do primeiro ao ultimo.
    ///
    /// <para>Precisa trazer <b>todos</b> os estados do projeto, uma vez cada,
    /// inclusive os aposentados. Uma lista parcial nao teria como dizer onde fica o
    /// que ficou de fora, e a ordem dele viraria sorteio.</para>
    /// </summary>
    public IReadOnlyList<Guid>? Order { get; set; }
}
