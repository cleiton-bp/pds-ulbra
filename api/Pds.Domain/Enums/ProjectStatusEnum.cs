namespace Pds.Domain.Enums;

/// <summary>Situacao do projeto. No banco vira texto em snake_case (active, archived).</summary>
public enum ProjectStatusEnum
{
    /// <summary>Em uso normal.</summary>
    Active,

    /// <summary>Arquivado: continua visivel e consultavel, so para de aceitar coisa nova.</summary>
    Archived,
}
