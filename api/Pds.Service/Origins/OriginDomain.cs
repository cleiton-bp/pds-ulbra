using System.Text.RegularExpressions;

namespace Pds.Service.Origins;

/// <summary>
/// Poe o que a pessoa digitou na forma unica em que o dominio e guardado e
/// comparado.
///
/// <para><b>Por que normalizar em vez de guardar como veio.</b> Quem configura
/// digita o que tem na mao: cola a URL da barra do navegador, escreve com
/// maiuscula, deixa a barra final. <c>https://Loja.com/</c> e <c>loja.com</c> sao
/// o mesmo endereco, e guardando os dois a lista ganha uma linha que nunca
/// combina com nada — e a trava de duplicado deixa de travar.</para>
///
/// <para>A porta continua fazendo parte de proposito: para o navegador,
/// <c>site.com</c> e <c>site.com:3000</c> sao origens diferentes, e apagar a porta
/// aqui autorizaria mais do que a pessoa pediu.</para>
/// </summary>
public static partial class OriginDomain
{
    /// <summary>
    /// O dominio pronto para gravar, mais a resposta de quem digitou <c>*.</c> na
    /// frente dele.
    /// </summary>
    /// <param name="Domain">Sem esquema, sem curinga, em minusculo.</param>
    /// <param name="Wildcard">
    /// Verdadeiro quando o curinga foi digitado. A tela escreve <c>*.site.com</c> na
    /// lista, entao quem copia de volta o que esta na tela digita o curinga — e
    /// recusar exatamente o que se mostra seria armadilha.
    /// </param>
    public readonly record struct NormalizedOrigin(string Domain, bool Wildcard);

    /// <summary>Limite do nome de dominio; a porta vem depois dele.</summary>
    private const int MaxHostLength = 253;

    private const int MaxLabelLength = 63;

    /// <summary>
    /// Devolve o dominio pronto para ser guardado, ou lanca
    /// <see cref="ArgumentException"/> dizendo o que corrigir.
    /// </summary>
    public static NormalizedOrigin Normalize(string? raw)
    {
        var value = (raw ?? string.Empty).Trim();

        if (value.Length == 0)
            throw new ArgumentException("Informe o dominio.");

        value = value.ToLowerInvariant();

        // Cola de barra de navegador: tira o esquema e tudo que vier depois do host.
        // **Vem antes do curinga**: em `https://*.site.com` o asterisco so fica no
        // comeco depois que o esquema sai, e conferir antes recusava a forma que a
        // propria tela escreve na lista.
        value = SchemePrefix().Replace(value, string.Empty);
        value = value.Split('/', '?', '#')[0];

        // O curinga so pode aparecer como prefixo, e ele **liga** a opcao de
        // subdominios em vez de virar parte do nome: guardar o asterisco faria a
        // mesma autorizacao existir de dois jeitos, e um deles ficaria em desacordo
        // com a caixa marcada.
        var wildcard = value.StartsWith("*.", StringComparison.Ordinal);
        if (wildcard)
            value = value[2..];

        if (value.Contains('*'))
            throw new ArgumentException("O * so vale no comeco, como em *.site.com.");

        if (value.Contains('@'))
            throw new ArgumentException("Informe apenas o dominio, sem usuario e senha.");

        if (value.Contains('['))
            throw new ArgumentException("Endereco IPv6 ainda nao e aceito. Informe um dominio.");

        // Ponto final e FQDN valido e ninguem digita de proposito; some para o
        // mesmo endereco nao entrar duas vezes.
        value = value.TrimEnd('.');

        if (value.Length == 0)
            throw new ArgumentException("Informe o dominio.");

        var host = value;
        var port = string.Empty;

        var separator = value.LastIndexOf(':');
        if (separator >= 0)
        {
            host = value[..separator];
            port = value[(separator + 1)..];

            if (!ushort.TryParse(port, out var number) || number == 0)
                throw new ArgumentException("A porta precisa ser um numero entre 1 e 65535.");

            port = number.ToString();
        }

        if (host.Length is 0 or > MaxHostLength)
            throw new ArgumentException($"O dominio precisa ter entre 1 e {MaxHostLength} caracteres.");

        if (host.Split('.').Any(label => label.Length > MaxLabelLength))
            throw new ArgumentException($"Cada parte do dominio pode ter no maximo {MaxLabelLength} caracteres.");

        if (!Host().IsMatch(host))
            throw new ArgumentException("Dominio invalido. Escreva no formato site.com, sem https:// e sem barra.");

        return new NormalizedOrigin(port.Length == 0 ? host : $"{host}:{port}", wildcard);
    }

    [GeneratedRegex(@"^[a-z][a-z0-9+.-]*://|^//")]
    private static partial Regex SchemePrefix();

    /// <summary>
    /// Partes separadas por ponto, cada uma comecando e terminando em letra ou
    /// numero. Uma parte so tambem passa, porque <c>localhost</c> e o endereco de
    /// quem esta testando antes de publicar.
    /// </summary>
    [GeneratedRegex(@"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$")]
    private static partial Regex Host();
}
