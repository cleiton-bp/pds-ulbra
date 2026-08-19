using System.Security.Cryptography;
using System.Text;

namespace Pds.Service.Security;

/// <summary>
/// Gera e confere as chaves de projeto.
///
/// <para><b>A secreta nao usa hash de senha.</b> bcrypt e parecidos sao lentos de
/// proposito, feitos para senha digitada por gente e vulneravel a tentativa e
/// erro. A chave secreta ja nasce longa e sorteada, entao nao ha o que adivinhar,
/// e ela e conferida a cada requisicao da integracao: usar bcrypt aqui deixaria
/// toda chamada mais lenta sem ganhar seguranca. Um hash rapido resolve.</para>
/// </summary>
public static class ProjectKeyGenerator
{
    /// <summary>Marca da chave publica. Vai aparecer no site do cliente.</summary>
    public const string PublicTag = "pk_";

    /// <summary>Marca da chave secreta. Ajuda a reconhecer um vazamento acidental em log ou commit.</summary>
    public const string SecretTag = "sk_";

    /// <summary>Tamanho do prefixo visivel: a marca mais oito caracteres do sorteio.</summary>
    public const int PrefixLength = 11;

    private const int PublicEntropyBytes = 18;
    private const int SecretEntropyBytes = 32;

    /// <summary>
    /// Gera a chave publica. Ela e guardada em claro porque precisa ser lida por
    /// qualquer um que abra a pagina do cliente: identifica o projeto, nao autentica
    /// ninguem.
    /// </summary>
    public static (string Value, string Prefix) GeneratePublic()
    {
        var value = PublicTag + RandomToken(PublicEntropyBytes);
        return (value, ExtractPrefix(value));
    }

    /// <summary>
    /// Gera a chave secreta. Devolve o valor completo, que sera mostrado uma unica
    /// vez, junto com o prefixo e o hash — que e o unico dos tres que fica no banco.
    /// </summary>
    public static (string Value, string Prefix, string Hash) GenerateSecret()
    {
        var value = SecretTag + RandomToken(SecretEntropyBytes);
        return (value, ExtractPrefix(value), ComputeHash(value));
    }

    /// <summary>Hash SHA-256 em hexadecimal minusculo.</summary>
    public static string ComputeHash(string value)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    /// <summary>Prefixo visivel de uma chave qualquer.</summary>
    public static string ExtractPrefix(string value)
        => value.Length >= PrefixLength ? value[..PrefixLength] : value;

    /// <summary>
    /// Confere uma chave apresentada contra o hash guardado, em tempo constante.
    ///
    /// A comparacao em tempo constante existe porque um <c>==</c> comum para no
    /// primeiro caractere diferente, e a diferenca de tempo entre parar no primeiro
    /// e parar no decimo permite descobrir o valor caractere a caractere.
    /// </summary>
    public static bool Matches(string candidate, string storedHash)
        => CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(ComputeHash(candidate)),
            Encoding.UTF8.GetBytes(storedHash));

    private static string RandomToken(int byteCount)
        => Convert.ToBase64String(RandomNumberGenerator.GetBytes(byteCount))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
}
