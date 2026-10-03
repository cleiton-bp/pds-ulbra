using System.Net;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Service.Email;

/// <summary>
/// O texto do e-mail do convite.
///
/// <para><b>Tudo o que veio de pessoa e escapado no HTML</b> — o nome do projeto e
/// o de quem convidou sao escritos por gente, e sem escapar o e-mail viraria a
/// pagina de outra pessoa dentro da caixa de quem recebe.</para>
///
/// <para><b>O produto nao e nomeado.</b> Quem recebe conhece o projeto e quem
/// convidou; e e isso que o e-mail diz.</para>
/// </summary>
public static class InvitationEmailComposer
{
    public static EmailMessage Compose(
        string to,
        string projectName,
        string invitedByName,
        ProjectRoleEnum role,
        int validDays,
        Uri link)
    {
        var papel = role == ProjectRoleEnum.Administrator ? "administrador" : "membro";
        var prazo = validDays == 1 ? "1 dia" : $"{validDays} dias";
        var endereco = link.AbsoluteUri;

        var texto =
            $"Olá!\n\n" +
            $"{invitedByName} convidou você para o time do projeto {projectName}, como {papel}.\n\n" +
            $"Para aceitar, abra o link abaixo e entre com a conta Google de {to}:\n" +
            $"{endereco}\n\n" +
            $"O convite vale por {prazo}. Se você não esperava este convite, ignore este e-mail.\n";

        var html =
            "<div style=\"font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #1f2328; max-width: 520px;\">" +
            "<p>Olá!</p>" +
            $"<p><b>{Html(invitedByName)}</b> convidou você para o time do projeto <b>{Html(projectName)}</b>, como {papel}.</p>" +
            $"<p>Para aceitar, abra o link abaixo e entre com a conta Google de <b>{Html(to)}</b>.</p>" +
            $"<p style=\"margin: 24px 0;\"><a href=\"{Html(endereco)}\" style=\"background: #1f2328; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; display: inline-block;\">Aceitar o convite</a></p>" +
            $"<p style=\"color: #59636e; font-size: 13px;\">O convite vale por {prazo}. Se você não esperava este convite, ignore este e-mail.</p>" +
            "</div>";

        return new EmailMessage(
            To: to,
            Subject: $"Convite para o projeto {projectName}",
            TextBody: texto,
            HtmlBody: html);
    }

    private static string Html(string value) => WebUtility.HtmlEncode(value);
}
