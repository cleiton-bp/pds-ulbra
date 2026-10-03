using System.Globalization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Email;

/// <summary>
/// Liga o envio de e-mail, <b>se</b> houver servidor configurado.
///
/// <para><b>A ausencia dele e um caminho previsto, e nao uma falha.</b> Sem nenhuma
/// das quatro chaves essenciais — servidor, remetente, usuario e senha — a aplicacao
/// sobe inteira, e o envio responde que nao esta disponivel. Porta, seguranca,
/// nome do remetente e espera sozinhos nao ligam nada: tem padrao. Mesma escolha do
/// <c>AddPdsStorage</c> com o armazenamento.</para>
///
/// <para><b>Configuracao pela metade e outra coisa, e ai derruba.</b> Nao
/// configurar e uma decisao; configurar o servidor e esquecer o remetente e um
/// engano, e um engano que so apareceria no primeiro e-mail que nao saiu. O que
/// falta, ou o que nao se le, e erro na subida — tudo de uma vez.</para>
/// </summary>
public static class EmailRegistration
{
    private const int MaxTimeoutSeconds = 300;

    public static IServiceCollection AddPdsEmail(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(SmtpOptions.SectionName);

        if (!IsConfigured(section))
        {
            services.AddSingleton<IEmailSender, UnavailableEmailSender>();
            return services;
        }

        var problemas = new List<string>();
        var options = Read(section, problemas);
        Validate(options, problemas);

        if (problemas.Count > 0)
            throw new InvalidOperationException(
                $"Envio de e-mail configurado pela metade: {string.Join("; ", problemas)}.");

        // A instancia ja conferida, e nao um novo bind: o que a subida aprovou e
        // exatamente o que o envio usa.
        services.AddSingleton(Options.Create(options));
        services.AddSingleton<IEmailSender, MailKitEmailSender>();

        return services;
    }

    /// <summary>
    /// Ligado e quando ha <b>alguma</b> das quatro essenciais. Em branco conta como
    /// ausente, como no resto da configuracao: a linha existir sem valor nao liga
    /// nada.
    /// </summary>
    private static bool IsConfigured(IConfigurationSection section)
        => new[] { "Host", "FromAddress", "Username", "Password" }
            .Any(chave => !string.IsNullOrWhiteSpace(section[chave]));

    /// <summary>
    /// Le campo a campo, em vez do bind automatico. O bind trata <c>Smtp__Port=</c>
    /// como texto vazio e falha na conversao — aqui, em branco vale o padrao. E o
    /// valor que nao se le vira um problema da lista, junto com os outros, em vez
    /// de interromper a conferencia no primeiro.
    /// </summary>
    internal static SmtpOptions Read(IConfigurationSection section, List<string> problemas)
    {
        var options = new SmtpOptions
        {
            Host = Text(section["Host"]),
            Username = Text(section["Username"]),
            Password = Text(section["Password"]),
            FromAddress = Text(section["FromAddress"]),
            FromName = Text(section["FromName"]),
        };

        if (Text(section["Port"]) is { } porta)
        {
            if (int.TryParse(porta, NumberStyles.None, CultureInfo.InvariantCulture, out var valor))
                options.Port = valor;
            else
                problemas.Add("Smtp__Port nao e numero");
        }

        if (Text(section["TimeoutSeconds"]) is { } espera)
        {
            if (int.TryParse(espera, NumberStyles.None, CultureInfo.InvariantCulture, out var valor))
                options.TimeoutSeconds = valor;
            else
                problemas.Add("Smtp__TimeoutSeconds nao e numero");
        }

        if (Text(section["Security"]) is { } seguranca)
        {
            // So o nome exato, sem diferenca de maiuscula. O Enum.TryParse aceitaria
            // "5" (um valor que nao existe) e "None, SslOnConnect" (dois juntos), e
            // os dois cairiam num modo que ninguem escolheu.
            var nome = Enum.GetNames<SmtpSecurity>()
                .FirstOrDefault(n => string.Equals(n, seguranca, StringComparison.OrdinalIgnoreCase));

            if (nome is null)
                problemas.Add("Smtp__Security e None, StartTls ou SslOnConnect");
            else
                options.Security = Enum.Parse<SmtpSecurity>(nome);
        }

        return options;
    }

    /// <summary>
    /// Confere o que foi lido, e acrescenta a lista tudo o que esta errado — e nao
    /// so o primeiro, para quem arruma nao subir a API tres vezes.
    /// </summary>
    internal static void Validate(SmtpOptions options, List<string> problemas)
    {
        if (options.Host is null)
            problemas.Add("falta Smtp__Host");

        if (options.FromAddress is null)
            problemas.Add("falta Smtp__FromAddress");
        else if (!EmailAddresses.TryParse(options.FromAddress, out _))
            problemas.Add("Smtp__FromAddress nao e um endereco de e-mail");

        if (options.Port is < 1 or > 65535)
            problemas.Add("Smtp__Port fora de 1 a 65535");

        // Com teto: espera de dias, na pratica, e espera nenhuma.
        if (options.TimeoutSeconds is < 1 or > MaxTimeoutSeconds)
            problemas.Add($"Smtp__TimeoutSeconds fora de 1 a {MaxTimeoutSeconds}");

        var temUsuario = options.Username is not null;
        var temSenha = options.Password is not null;

        // Usuario sem senha, ou o contrario, nunca autentica: o servidor recusaria
        // no primeiro envio, e a causa ficaria escondida atras de "falha de login".
        if (temUsuario != temSenha)
            problemas.Add("Smtp__Username e Smtp__Password vem juntos");

        // Senha numa conexao sem TLS atravessa a rede em texto aberto. Servidor
        // que pede senha oferece TLS, entao quem cai aqui errou o Security.
        if (temUsuario && options.Security == SmtpSecurity.None)
            problemas.Add("com usuario e senha, Smtp__Security precisa ser StartTls ou SslOnConnect");
    }

    private static string? Text(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
