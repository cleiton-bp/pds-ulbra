namespace Pds.Domain.Enums;

/// <summary>A camada de limite da entrada de relatos, da mais estreita para a mais larga.</summary>
public enum ReportLimitScopeEnum
{
    /// <summary>A mesma pessoa: o codigo pessoal, no projeto que usa esse modo; senao, o IP.</summary>
    Reporter,

    /// <summary>O mesmo IP.</summary>
    Ip,

    /// <summary>O mesmo endereco de origem declarado pela pagina.</summary>
    Origin,

    /// <summary>O projeto inteiro, na hora ou no dia.</summary>
    Project,
}
