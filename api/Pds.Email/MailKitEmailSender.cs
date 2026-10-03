using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using MimeKit.Utils;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Email;

/// <summary>
/// Manda o e-mail por SMTP, com o MailKit.
///
/// <para><b>Uma conexao por envio.</b> Abre, entrega e fecha. Nao ha conexao
/// guardada entre envios — e o servidor que derruba conexao parada nao vira um
/// erro esquisito no envio seguinte. Para o volume de convite e aviso, o custo de
/// abrir a conexao nao pesa.</para>
///
/// <para><b>A falha sobe como excecao</b>, sem nova tentativa aqui dentro: quem
/// chama e que sabe se vale tentar de novo, e quando. Mas so falha o que nao foi
/// entregue — depois de o servidor aceitar a mensagem, nada mais lanca.</para>
/// </summary>
public sealed class MailKitEmailSender : IEmailSender
{
    private readonly SmtpOptions _options;
    private readonly string _host;
    private readonly MailboxAddress _from;
    private readonly ILogger<MailKitEmailSender> _logger;

    public MailKitEmailSender(IOptions<SmtpOptions> options, ILogger<MailKitEmailSender> logger)
    {
        _options = options.Value;
        _logger = logger;

        // A subida ja conferiu os dois (EmailRegistration). Aqui e so a garantia de
        // que ninguem montou este envio por fora daquele caminho.
        _host = _options.Host ?? throw new InvalidOperationException("Smtp__Host nao configurado.");

        // O remetente sai da mesma leitura que a subida aprovou, e nao do texto cru:
        // "Equipe <a@exemplo.com>" passa na conferencia, e o texto cru quebraria aqui,
        // no primeiro envio. O nome configurado vence o que veio dentro do endereco.
        if (!EmailAddresses.TryParse(_options.FromAddress, out var from))
            throw new InvalidOperationException("Smtp__FromAddress nao e um endereco de e-mail.");

        _from = new MailboxAddress(SingleLine(_options.FromName ?? from.Name ?? string.Empty), from.Address);
    }

    public bool IsAvailable => true;

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        var mime = BuildMessage(message, _from);

        using var client = new SmtpClient
        {
            Timeout = (int)TimeSpan.FromSeconds(_options.TimeoutSeconds).TotalMilliseconds,

            // O certificado do servidor continua conferido inteiro — a cadeia ate uma
            // autoridade confiavel, o nome do servidor e a validade. So nao se consulta
            // a lista de revogacao: a consulta depende de alcancar outro servidor, e no
            // macOS e em muito container ela termina "incompleta", o que o MailKit trata
            // como certificado invalido e recusa o envio. E o mesmo padrao do HttpClient
            // do .NET em toda chamada HTTPS.
            CheckCertificateRevocation = false,
        };

        await client.ConnectAsync(_host, _options.Port, ToSocketOptions(_options.Security), cancellationToken);

        // Usuario e senha vem juntos, ou nenhum dos dois — a subida recusa a metade.
        if (_options.Username is not null)
            await client.AuthenticateAsync(_options.Username, _options.Password ?? string.Empty, cancellationToken);

        await client.SendAsync(mime, cancellationToken);

        // O endereco de quem recebe nao vai para o log: e dado da pessoa, e o
        // identificador da mensagem basta para achar o envio no servidor.
        _logger.LogInformation("E-mail entregue ao servidor: {MessageId}.", mime.MessageId);

        // **Daqui para baixo, nada lanca.** O servidor ja aceitou a mensagem: uma
        // falha no QUIT — tempo esgotado, cancelamento — subindo como erro faria
        // quem chama tentar de novo, e a pessoa receberia o mesmo e-mail duas vezes.
        try
        {
            await client.DisconnectAsync(quit: true, CancellationToken.None);
        }
        catch (Exception erro)
        {
            _logger.LogWarning("E-mail {MessageId} entregue; o encerramento da conexao falhou: {Erro}.",
                mime.MessageId, erro.GetType().Name);
        }
    }

    /// <summary>
    /// Monta a mensagem. Separado do envio para a montagem poder ser conferida sem
    /// servidor nenhum.
    /// </summary>
    internal static MimeMessage BuildMessage(EmailMessage message, MailboxAddress from)
    {
        // Um destinatario, e so ele, com dominio. Ver EmailAddresses.
        if (!EmailAddresses.TryParse(message.To, out var to))
            throw new ArgumentException("Endereco de destino invalido.", nameof(message));

        if (string.IsNullOrWhiteSpace(message.TextBody))
            throw new ArgumentException("O e-mail precisa de texto.", nameof(message));

        if (!string.IsNullOrWhiteSpace(message.ToName))
            to.Name = SingleLine(message.ToName);

        var mime = new MimeMessage();
        mime.From.Add(from);
        mime.To.Add(to);

        // Quebra de linha no assunto vira espaco. O MimeKit ja codifica o
        // cabecalho, e isto e a segunda trava: assunto e uma linha, sempre.
        mime.Subject = SingleLine(message.Subject ?? string.Empty);

        // O identificador leva o dominio do remetente. O padrao do MimeKit usa o
        // nome da maquina que enviou — e entregaria a todo destinatario o nome do
        // computador de quem roda a API, alem de pesar contra no filtro de spam.
        mime.MessageId = MimeUtils.GenerateMessageId(from.Domain);

        // Mensagem automatica, e declarada como tal (RFC 3834): resposta de ferias
        // e "fora do escritorio" nao voltam para um remetente que ninguem le.
        mime.Headers.Add("Auto-Submitted", "auto-generated");

        mime.Body = new BodyBuilder
        {
            TextBody = message.TextBody,
            HtmlBody = string.IsNullOrWhiteSpace(message.HtmlBody) ? null : message.HtmlBody,
        }.ToMessageBody();

        return mime;
    }

    private static string SingleLine(string value)
        => value.Replace("\r\n", " ").Replace('\r', ' ').Replace('\n', ' ').Trim();

    private static SecureSocketOptions ToSocketOptions(SmtpSecurity security) => security switch
    {
        SmtpSecurity.None => SecureSocketOptions.None,
        SmtpSecurity.SslOnConnect => SecureSocketOptions.SslOnConnect,
        _ => SecureSocketOptions.StartTls,
    };
}
