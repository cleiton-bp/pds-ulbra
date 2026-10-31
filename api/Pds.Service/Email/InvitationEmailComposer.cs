using System.Net;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Service.Email;

/// <summary>
/// O texto do e-mail do convite.
///
/// <para><b>O assunto e a primeira frase sao fixos.</b> O nome do projeto e o de quem
/// convidou sao escritos por qualquer pessoa: no assunto, ou em destaque, virariam a
/// manchete de um golpe saindo do nosso remetente ("Sua conta sera bloqueada, acesse...").
/// Eles aparecem num bloco de baixo, curtos, como informacao.</para>
///
/// <para><b>Tudo o que veio de pessoa e escapado no HTML</b>: sem escapar, o e-mail viraria
/// a pagina de outra pessoa dentro da caixa de quem recebe.</para>
///
/// <para><b>O produto nao e nomeado no texto.</b> Quem recebe ja o ve no nome do remetente.</para>
/// </summary>
public static class InvitationEmailComposer
{
    /// <summary>Quanto de um nome escrito por pessoa aparece no e-mail.</summary>
    private const int MaxShownLength = 80;

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
        var projeto = Short(projectName);
        var quem = Short(invitedByName);

        var texto =
            $"Olá!\n\n" +
            $"Você recebeu um convite para entrar num time, como {papel}.\n\n" +
            $"Projeto: {projeto}\n" +
            $"Convite de: {quem}\n\n" +
            $"Para aceitar, abra o link abaixo e entre com a conta Google de {to}:\n" +
            $"{endereco}\n\n" +
            $"O convite vale por {prazo}. Se você não esperava este convite, ignore este e-mail.\n";

        var html =
            "<div style=\"font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #1f2328; max-width: 520px;\">" +
            "<p>Olá!</p>" +
            $"<p><b>Você recebeu um convite para entrar num time</b>, como {papel}.</p>" +
            "<p style=\"color: #59636e; font-size: 14px; border-left: 3px solid #d0d7de; padding-left: 12px;\">" +
            $"Projeto: {Html(projeto)}<br>Convite de: {Html(quem)}</p>" +
            $"<p>Para aceitar, abra o link abaixo e entre com a conta Google de <b>{Html(to)}</b>.</p>" +
            $"<p style=\"margin: 24px 0;\"><a href=\"{Html(endereco)}\" style=\"background: #1f2328; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; display: inline-block;\">Aceitar o convite</a></p>" +
            $"<p style=\"color: #59636e; font-size: 13px;\">O convite vale por {prazo}. Se você não esperava este convite, ignore este e-mail.</p>" +
            "</div>";

        return new EmailMessage(
            To: to,
            Subject: "Convite para entrar num time",
            TextBody: texto,
            HtmlBody: html);
    }

    /// <summary>O nome numa linha so e curto: o que passar de <see cref="MaxShownLength"/> vira "...".</summary>
    private static string Short(string value)
    {
        var linha = string.Join(' ', value.Split(['\r', '\n', '\t'], StringSplitOptions.RemoveEmptyEntries)).Trim();
        return linha.Length <= MaxShownLength ? linha : string.Concat(linha.AsSpan(0, MaxShownLength).TrimEnd(), "...");
    }

    private static string Html(string value) => WebUtility.HtmlEncode(value);
}
