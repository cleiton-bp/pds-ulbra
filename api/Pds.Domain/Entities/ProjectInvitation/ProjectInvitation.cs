using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O convite para alguem entrar no time de um projeto, com um papel.
///
/// <para><b>O link de aceitar nunca e guardado.</b> Ele nasce na hora de montar o
/// e-mail, e o banco fica so com o hash (<see cref="TokenHash"/>) — o mesmo cuidado
/// da chave secreta do projeto. Quem le o banco nao aceita convite de ninguem, e
/// reenviar gera outro link, que invalida o anterior.</para>
///
/// <para><b>Aceitar exige o Google do mesmo endereco.</b> O link sozinho nao basta:
/// encaminhado para outra pessoa, ele nao serve para ela.</para>
///
/// <para><b>Aberto</b> e o convite nem aceito nem cancelado. Vencido continua
/// aberto — e o que permite reenviar o mesmo convite com prazo novo, em vez de
/// empilhar convites para o mesmo endereco.</para>
/// </summary>
public class ProjectInvitation : PdsBaseEntity
{
    /// <summary>Tamanho maximo de um endereco de e-mail (RFC 5321).</summary>
    public const int MaxEmailLength = 320;

    /// <summary>Tamanho maximo do motivo da falha do envio.</summary>
    public const int MaxEmailErrorLength = 200;

    /// <summary>Projeto para o qual a pessoa foi convidada.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>Endereco convidado, em minusculas. E ele que o Google precisa confirmar.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>O papel com que a pessoa entra.</summary>
    public ProjectRoleEnum Role { get; set; } = ProjectRoleEnum.Member;

    /// <summary>Quem convidou.</summary>
    public long InvitedByUserId { get; set; }
    public User InvitedByUser { get; set; } = null!;

    /// <summary>
    /// Hash do link que esta valendo. Nulo enquanto o e-mail nao foi montado, e
    /// trocado a cada reenvio.
    /// </summary>
    public string? TokenHash { get; set; }

    /// <summary>Ate quando o convite vale. Reenviar renova.</summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>Quando a pessoa aceitou.</summary>
    public DateTime? AcceptedAt { get; set; }

    /// <summary>Quem aceitou — a pessoa que entrou no time.</summary>
    public long? AcceptedByUserId { get; set; }
    public User? AcceptedByUser { get; set; }

    /// <summary>Quando um administrador cancelou.</summary>
    public DateTime? RevokedAt { get; set; }

    /// <summary>Onde esta o e-mail deste convite.</summary>
    public InvitationEmailStatusEnum EmailStatus { get; set; } = InvitationEmailStatusEnum.Pending;

    /// <summary>Quando o envio foi tentado pela ultima vez.</summary>
    public DateTime? EmailAttemptedAt { get; set; }

    /// <summary>Quando o servidor de e-mail aceitou a mensagem.</summary>
    public DateTime? EmailSentAt { get; set; }

    /// <summary>
    /// Por que o e-mail nao saiu — o tipo da falha, e nunca a mensagem do servidor,
    /// que costuma repetir o endereco de quem recebe.
    /// </summary>
    public string? EmailError { get; set; }

    /// <summary>Nem aceito, nem cancelado.</summary>
    public bool IsOpen => AcceptedAt is null && RevokedAt is null;

    /// <summary>Passou do prazo.</summary>
    public bool IsExpiredAt(DateTime now) => ExpiresAt <= now;
}
