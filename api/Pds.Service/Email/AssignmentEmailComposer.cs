using System.Net;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Service.Email;

/// <summary>
/// O texto do e-mail de quem passou a ser responsavel por um card.
///
/// <para><b>Tudo o que veio de pessoa e escapado no HTML</b> — o titulo do card, o nome
/// do projeto e o de quem escolheu, como no convite. E o produto nao e nomeado: quem
/// recebe conhece o projeto e quem o escolheu.</para>
/// </summary>
public static class AssignmentEmailComposer
{
    public static EmailMessage Compose(
        string to,
        string actorName,
        int cardNumber,
        string cardHeadline,
        string projectName,
        Uri link)
    {
        var endereco = link.AbsoluteUri;

        var texto =
            $"Olá!\n\n" +
            $"{actorName} escolheu você como responsável pelo #{cardNumber} {cardHeadline}, no projeto {projectName}.\n\n" +
            $"Para abrir o card:\n{endereco}\n\n" +
            $"Você recebe este e-mail porque está no time do projeto {projectName}. Para não receber mais, desligue em Avisos, no sino do painel.\n";

        var html =
            "<div style=\"font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #1f2328; max-width: 520px;\">" +
            "<p>Olá!</p>" +
            $"<p><b>{Html(actorName)}</b> escolheu você como responsável pelo <b>#{cardNumber} {Html(cardHeadline)}</b>, no projeto <b>{Html(projectName)}</b>.</p>" +
            $"<p style=\"margin: 24px 0;\"><a href=\"{Html(endereco)}\" style=\"background: #1f2328; color: #ffffff; padding: 10px 18px; border-radius: 8px; text-decoration: none; display: inline-block;\">Abrir o card</a></p>" +
            $"<p style=\"color: #59636e; font-size: 13px;\">Você recebe este e-mail porque está no time do projeto {Html(projectName)}. Para não receber mais, desligue em Avisos, no sino do painel.</p>" +
            "</div>";

        return new EmailMessage(
            To: to,
            Subject: $"#{cardNumber} {cardHeadline} — você é o responsável",
            TextBody: texto,
            HtmlBody: html);
    }

    private static string Html(string value) => WebUtility.HtmlEncode(value);
}
