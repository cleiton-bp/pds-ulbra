using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Uma sprint do projeto: um pedaco de tempo com os cards que o time se propoe a
/// terminar nele.
///
/// <para><b>Uma em andamento por vez</b> — e a que o quadro mostra —, e quantas
/// planejadas o time quiser. Fechar decide o destino do que nao terminou; o que
/// terminou fica nela.</para>
///
/// <para><b>Interno.</b> Nenhuma rota publica le esta tabela, nem a sprint do card.</para>
/// </summary>
public class Sprint : PdsBaseEntity
{
    /// <summary>Teto do nome. Curto: e o titulo de uma secao do backlog.</summary>
    public const int MaxNameLength = 60;

    /// <summary>Teto do objetivo da sprint.</summary>
    public const int MaxGoalLength = 500;

    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>O numero da sprint no projeto, que da o nome de fabrica ("Sprint 3"). Nunca repete.</summary>
    public int Number { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>O que o time quer entregar nesta sprint. Opcional.</summary>
    public string? Goal { get; set; }

    public SprintStateEnum State { get; set; }

    /// <summary>O primeiro dia da sprint.</summary>
    public DateOnly StartsOn { get; set; }

    /// <summary>O ultimo dia da sprint.</summary>
    public DateOnly EndsOn { get; set; }

    /// <summary>Quando foi iniciada, em UTC. Nulo enquanto planejada.</summary>
    public DateTime? StartedAt { get; set; }

    /// <summary>Quando foi fechada, em UTC. Nulo enquanto nao fechou.</summary>
    public DateTime? ClosedAt { get; set; }
}
