namespace Pds.Domain.Enums;

/// <summary>Onde a sprint esta na vida dela.</summary>
public enum SprintStateEnum
{
    /// <summary>Planejada: recebe cards, e ainda nao comecou.</summary>
    Planned,

    /// <summary>Em andamento: a que o quadro mostra. Uma por projeto.</summary>
    Active,

    /// <summary>Fechada: os cards que terminaram ficam nela, para a historia.</summary>
    Closed,
}
