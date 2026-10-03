namespace Pds.WebApi.Authorization;

/// <summary>
/// Marca uma escrita de membro fora de <c>/reports</c>, declarada de proposito.
///
/// <para>A regra de <see cref="ProjectRoleCoverage"/> exige administrador em toda
/// escrita fora da Operacao, para uma acao nova num controlador de configuracao nao
/// herdar o "membro" da classe sem ninguem notar. Esta marca e a excecao escrita:
/// quem a poe esta dizendo que a acao e trabalho do time, e nao configuracao — e o
/// motivo fica no codigo, ao lado dela.</para>
/// </summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false, Inherited = false)]
public sealed class MemberWriteAttribute : Attribute
{
    public MemberWriteAttribute(string reason)
    {
        Reason = reason;
    }

    /// <summary>Por que esta escrita e de membro.</summary>
    public string Reason { get; }
}
