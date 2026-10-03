namespace Pds.Domain.Enums;

/// <summary>
/// Por que este servidor nao manda convite. O painel escreve a frase; aqui so o
/// motivo, que quem cuida do servidor resolve no .env.local.
/// </summary>
public enum InvitationUnavailableReasonEnum
{
    /// <summary>Sem servidor de e-mail (a secao Smtp).</summary>
    EmailNotConfigured,

    /// <summary>Sem fila (RABBITMQ_URL): o e-mail sai por ela.</summary>
    QueueNotConfigured,

    /// <summary>Sem o endereco do painel (PANEL_URL), que vai no link do e-mail.</summary>
    PanelUrlNotConfigured,
}
