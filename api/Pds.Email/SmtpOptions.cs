namespace Pds.Email;

/// <summary>
/// Como a conexao com o servidor SMTP e protegida.
/// </summary>
public enum SmtpSecurity
{
    /// <summary>
    /// Sem criptografia. So serve para um servidor na propria maquina ou numa rede
    /// fechada, que nao pede senha: com usuario e senha, a senha iria em texto
    /// aberto, e por isso a subida recusa.
    /// </summary>
    None,

    /// <summary>
    /// Conecta aberto e sobe para TLS antes de qualquer coisa. <b>Obrigatorio</b>:
    /// servidor que nao oferece TLS e recusado, em vez de seguir aberto em silencio.
    /// Padrao, e o que a porta 587 dos provedores espera.
    /// </summary>
    StartTls,

    /// <summary>TLS desde o primeiro byte, como a porta 465 espera.</summary>
    SslOnConnect,
}

/// <summary>
/// O que este projeto precisa saber para falar com o servidor de e-mail. Vem da
/// secao <c>Smtp</c> da configuracao.
///
/// <para><b>Os valores moram no <c>.env.local</c></b>, como toda configuracao da
/// API, com dois sublinhados no lugar dos dois pontos: <c>Smtp__Host</c> e a chave
/// <c>Smtp:Host</c>. A secao e lida <b>so das variaveis de ambiente</b> (ver o
/// <c>Startup</c>): uma secao <c>Smtp</c> no <c>appsettings.json</c> nao vale —
/// senha de SMTP em arquivo versionado e senha vazada.</para>
///
/// <para><b>Nada aqui nomeia um provedor</b>: sao os dados que qualquer servidor
/// SMTP pede, e trocar de provedor e trocar estes valores.</para>
/// </summary>
public sealed class SmtpOptions
{
    /// <summary>Nome da secao na configuracao.</summary>
    public const string SectionName = "Smtp";

    /// <summary>
    /// Endereco do servidor. Uma das quatro essenciais, com o remetente, o usuario e
    /// a senha: sem nenhuma delas o e-mail fica indisponivel; com parte, a subida
    /// recusa.
    /// </summary>
    public string? Host { get; set; }

    /// <summary>Porta. Padrao: 587.</summary>
    public int Port { get; set; } = 587;

    /// <summary>Como a conexao e protegida. Padrao: <see cref="SmtpSecurity.StartTls"/>.</summary>
    public SmtpSecurity Security { get; set; } = SmtpSecurity.StartTls;

    /// <summary>Usuario, quando o servidor exige. Vem sempre junto da senha.</summary>
    public string? Username { get; set; }

    /// <summary>Senha, quando o servidor exige. Vem sempre junto do usuario.</summary>
    public string? Password { get; set; }

    /// <summary>Endereco que aparece como remetente. Obrigatorio com o servidor configurado.</summary>
    public string? FromAddress { get; set; }

    /// <summary>Nome que aparece ao lado do remetente. Opcional.</summary>
    public string? FromName { get; set; }

    /// <summary>
    /// Quanto tempo esperar o servidor, em segundos. Padrao: 30; de 1 a 300.
    ///
    /// <para>Sem teto, um servidor que aceita a conexao e nao responde prenderia o
    /// envio para sempre.</para>
    /// </summary>
    public int TimeoutSeconds { get; set; } = 30;
}
