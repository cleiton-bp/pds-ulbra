namespace Pds.Domain.Enums;

/// <summary>
/// O que a pessoa ve ao abrir o link do convite, ja com a sessao dela.
/// </summary>
public enum InvitationPreviewStatusEnum
{
    /// <summary>Pode aceitar.</summary>
    Valid,

    /// <summary>
    /// Entrou com outra conta Google. A tela mostra so uma pista do endereco
    /// convidado — e nada do projeto: quem esta do outro lado nao e a pessoa
    /// convidada.
    /// </summary>
    WrongAccount,

    /// <summary>E o mesmo endereco, mas o Google nao confirmou que a conta e dona dele.</summary>
    EmailNotVerified,

    /// <summary>Passou do prazo. Quem convidou pode reenviar.</summary>
    Expired,

    /// <summary>Ja foi aceito — por esta pessoa, que agora esta no time.</summary>
    AlreadyAccepted,

    /// <summary>A pessoa ja esta no time, ou e dona do projeto.</summary>
    AlreadyMember,
}
