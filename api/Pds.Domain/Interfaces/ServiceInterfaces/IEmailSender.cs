namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// Um e-mail pronto para sair: para quem, sobre o que e o texto.
///
/// <para><b>O texto simples e obrigatorio, e o HTML e opcional.</b> Todo leitor de
/// e-mail mostra texto; nem todo mostra HTML, e filtro de spam desconfia de
/// mensagem que so tem HTML.</para>
/// </summary>
/// <param name="To">Endereco de quem recebe. Um so: lista separada por virgula e recusada.</param>
/// <param name="Subject">Assunto. Quebra de linha vira espaco.</param>
/// <param name="TextBody">O texto, em texto simples.</param>
/// <param name="HtmlBody">
/// O mesmo texto em HTML, quando houver. <b>Vai como esta</b>: quem monta escapa o
/// que veio de pessoa — nome de projeto, nome de quem convida —, ou o e-mail vira
/// a pagina de outra pessoa.
/// </param>
/// <param name="ToName">Nome de quem recebe, mostrado ao lado do endereco.</param>
public record EmailMessage(
    string To,
    string Subject,
    string TextBody,
    string? HtmlBody = null,
    string? ToName = null);

/// <summary>
/// Manda um e-mail. Quem usa conhece so isto; quem implementa e que sabe de SMTP.
///
/// <para><b>Nada aqui nomeia um provedor.</b> O envio e por SMTP, que todo provedor
/// fala, e trocar de provedor e trocar configuracao — mesma escolha do
/// armazenamento com a API do S3.</para>
///
/// <para><b>Nao e para chamar dentro da requisicao.</b> Mandar e-mail faz quem
/// clicou esperar um servidor de fora, e uma falha no envio nao pode desfazer o que
/// a pessoa fez: o envio sai pela fila, depois de gravado.</para>
/// </summary>
public interface IEmailSender
{
    /// <summary>
    /// Se existe servidor de e-mail configurado. Falso quando a aplicacao subiu sem
    /// ele — e entao quem depende de e-mail precisa oferecer outro caminho, e nao
    /// prometer um envio que nunca vai acontecer.
    /// </summary>
    bool IsAvailable { get; }

    /// <summary>
    /// Entrega o e-mail ao servidor SMTP. <b>Falha com excecao</b>, e quem chama
    /// decide se tenta de novo: aqui nao ha nova tentativa escondida. Depois de o
    /// servidor aceitar a mensagem, nada mais lanca — tentar de novo ali seria
    /// mandar o mesmo e-mail duas vezes.
    ///
    /// <para><b>A mensagem da excecao pode repetir o destinatario</b> — servidor
    /// SMTP costuma responder "550 &lt;fulano@...&gt; ...". Quem registra a falha
    /// registra o tipo e o codigo, e nao a mensagem.</para>
    /// </summary>
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default);
}
