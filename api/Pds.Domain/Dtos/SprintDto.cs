using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// O nome, o objetivo e as datas de uma sprint. Ao criar e ao iniciar, o que nao vier
/// fica como esta (ou nasce com o padrao); ao editar, vai inteiro — o objetivo vazio
/// apaga.
/// </summary>
public class SaveSprintDto
{
    /// <summary>O nome. Ate 60 caracteres. De fabrica, Sprint e o numero.</summary>
    /// <example>Sprint 3</example>
    public string? Name { get; set; }

    /// <summary>O que o time quer entregar nesta sprint. Ate 500 caracteres.</summary>
    public string? Goal { get; set; }

    /// <summary>O primeiro dia.</summary>
    public DateOnly? StartsOn { get; set; }

    /// <summary>O ultimo dia — no primeiro, ou depois dele.</summary>
    public DateOnly? EndsOn { get; set; }
}

/// <summary>Para onde vai o que nao terminou quando a sprint fecha.</summary>
public enum SprintCloseDestinationEnum
{
    /// <summary>De volta ao backlog.</summary>
    Backlog,

    /// <summary>Para uma sprint planejada — a de <c>SprintPublicId</c>.</summary>
    Sprint,

    /// <summary>Para uma sprint nova, planejada, que nasce agora.</summary>
    NewSprint,
}

/// <summary>Fechar a sprint em andamento.</summary>
public class CloseSprintDto
{
    /// <summary>Para onde vai o que nao terminou. Obrigatorio.</summary>
    /// <example>Backlog</example>
    public SprintCloseDestinationEnum? Destination { get; set; }

    /// <summary>A sprint planejada de destino, quando <c>Destination</c> e <c>Sprint</c>.</summary>
    public Guid? SprintPublicId { get; set; }
}

/// <summary>
/// Por o card numa sprint, ou no backlog, e no lugar da lista: logo abaixo de um card,
/// no topo, ou no fim.
/// </summary>
public class SetCardSprintDto
{
    /// <summary>A sprint de destino. Nulo e o backlog.</summary>
    public Guid? SprintPublicId { get; set; }

    /// <summary>O card logo acima, na lista de destino. Sem ele, o topo ou o fim.</summary>
    public Guid? AfterPublicId { get; set; }

    /// <summary>Sem <c>AfterPublicId</c>: verdadeiro poe no topo; falso ou ausente, no fim.</summary>
    public bool? Top { get; set; }
}

/// <summary>A estimativa do card.</summary>
public class SetCardPointsDto
{
    /// <summary>De 0 a 999, com meio ponto. Nulo tira a estimativa.</summary>
    /// <example>3</example>
    public decimal? Points { get; set; }
}
