using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>Uma prioridade nova. Entra como a mais urgente; a posicao se ajusta depois.</summary>
public class CreateProjectPriorityDto
{
    /// <summary>Como o time chama esta prioridade. Ate 40 caracteres, unico no projeto.</summary>
    /// <example>Bloqueante</example>
    public string? Name { get; set; }

    /// <summary>A cor, da paleta fixa. Obrigatoria.</summary>
    /// <example>Red</example>
    public CardColorEnum? Color { get; set; }
}

/// <summary>Nome e cor de uma prioridade, gravados juntos.</summary>
public class UpdateProjectPriorityDto
{
    /// <summary>
    /// O nome passa a valer de agora em diante. O historico nao muda: cada evento
    /// guarda o nome que valia quando aconteceu.
    /// </summary>
    /// <example>Critica</example>
    public string? Name { get; set; }

    /// <summary>A cor, da paleta fixa. Obrigatoria.</summary>
    /// <example>Red</example>
    public CardColorEnum? Color { get; set; }
}

/// <summary>A ordem das prioridades, da menos para a mais urgente.</summary>
public class ReorderProjectPrioritiesDto
{
    /// <summary>
    /// Os identificadores publicos de <b>todas</b> as prioridades do projeto, uma vez
    /// cada, inclusive as aposentadas.
    /// </summary>
    public List<Guid>? Order { get; set; }
}
