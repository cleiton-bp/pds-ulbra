namespace Pds.Domain.Entities;

/// <summary>
/// A regra da exclusao da conta, num lugar so.
///
/// <para><b>Vinte e quatro horas, e o prazo vai gravado no pedido.</b> Quem pede a
/// exclusao tem esse tempo para se arrepender: entrar no painel de novo cancela tudo e
/// devolve os projetos como estavam. O prazo nao sai de <c>DeletedAt</c> mais uma
/// constante, e sim de <see cref="Account.PurgeAt"/>, gravado no momento do pedido: no
/// dia em que a regra mudar, quem ja pediu mantem o prazo que leu no aviso.</para>
///
/// <para><b>E regra do produto, igual para todos</b>, e nao configuracao do projeto: a
/// conta e de uma pessoa, e o prazo e a promessa feita a ela no dialogo de
/// confirmacao.</para>
/// </summary>
public static class AccountDeletionDefaults
{
    /// <summary>Horas entre o pedido e a exclusao definitiva.</summary>
    public const int GraceHours = 24;

    /// <summary>O nome que fica na conta depois da exclusao: nao identifica ninguem.</summary>
    public const string DeletedAccountName = "Conta excluída";

    /// <summary>
    /// O nome que fica no lugar do da pessoa onde ela escreveu em projeto de outra conta. O
    /// comentario continua, porque e do historico daquele time, mas sem dizer de quem foi.
    /// </summary>
    public const string DeletedPersonName = "Pessoa removida";
}
