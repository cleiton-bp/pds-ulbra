using MimeKit;

namespace Pds.Email;

/// <summary>
/// A leitura de endereco que o remetente e o destinatario usam, e a mesma para os
/// dois.
///
/// <para><b>Exige o dominio.</b> O MimeKit aceita, por padrao, endereco sem
/// <c>@dominio</c> — "fulano" passaria, e so o servidor recusaria, no meio do
/// envio. Aqui a recusa vem antes de conectar.</para>
/// </summary>
internal static class EmailAddresses
{
    private static readonly ParserOptions Strict = CreateStrict();

    private static ParserOptions CreateStrict()
    {
        var options = ParserOptions.Default.Clone();
        options.AllowAddressesWithoutDomain = false;
        return options;
    }

    /// <summary>
    /// Le <b>um</b> endereco, com dominio. Lista (virgula ou ponto e virgula) e
    /// quebra de linha sao recusadas: mandariam a mensagem para quem ninguem
    /// escolheu.
    /// </summary>
    public static bool TryParse(string? value, out MailboxAddress address)
    {
        address = null!;

        if (string.IsNullOrWhiteSpace(value) || value.IndexOfAny(['\r', '\n', ',', ';']) >= 0)
            return false;

        if (!MailboxAddress.TryParse(Strict, value, out var parsed) || string.IsNullOrEmpty(parsed.Domain))
            return false;

        address = parsed;
        return true;
    }
}
