using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Pds.Domain.Entities;

namespace Pds.Service.Security;

/// <summary>
/// A identidade que vem do sistema do cliente, assinada por ele.
///
/// <para><b>Assimetrica, de proposito.</b> O cliente guarda a chave privada e nos
/// da so a publica (ECDSA P-256). Nos conferimos a assinatura e nunca chamamos o
/// sistema dele; um vazamento do nosso banco nao permite forjar identidade nenhuma,
/// nem por nos. A alternativa simetrica (HMAC com a chave secreta do projeto) nao e
/// implementavel: o banco guarda so o hash da secreta.</para>
///
/// <para><b>O token e um JWT ES256 dedicado</b>, emitido pelo servidor do cliente para
/// esta finalidade — nunca o token de login do usuario, que daria a um terceiro uma
/// credencial que abre a API do proprio cliente. Traz <c>sub</c> (quem e a pessoa,
/// opaco para nos), <c>aud</c> igual a chave publica do projeto apresentada no envio
/// (amarra o token ao projeto) e <c>exp</c> dentro do teto do projeto. <c>name</c> e
/// opcional, e so sugere o nome no formulario. <c>iss</c> e <c>jti</c> nao sao
/// conferidos.</para>
///
/// <para><b>O <c>alg</c> e fixo em ES256.</b> <c>alg: none</c> passaria sem
/// assinatura, e <c>HS256</c> faria a biblioteca tratar a chave <i>publica</i> como
/// segredo compartilhado — qualquer um que a leia assinaria o que quisesse.</para>
///
/// <para><b>O que guardamos da pessoa e so um hash do <c>sub</c></b>, com um sal
/// proprio do projeto: a lista pessoal funciona igual, e quem abre o banco nao descobre
/// quem a pessoa e no sistema do cliente.</para>
/// </summary>
public static class InheritedIdentity
{
    /// <summary>Teto do token, antes de qualquer leitura: um JWT ES256 com as claims daqui tem umas centenas de bytes.</summary>
    public const int MaxTokenLength = 4096;
    public const int MaxSubjectLength = 256;
    public const int MaxNameLength = 120;

    /// <summary>O OID da curva P-256 (secp256r1), a unica aceita.</summary>
    private const string P256Oid = "1.2.840.10045.3.1.7";

    /// <summary>O que o token diz: quem e a pessoa, e como ela se chama (se o token disser).</summary>
    public readonly record struct Claims(string Subject, string? Name);

    /// <summary>
    /// A chave como colada no painel, limpa: aceita o PEM (<c>-----BEGIN PUBLIC KEY-----</c>)
    /// e o SPKI em base64 numa linha, com ou sem quebras e espacos. Devolve nulo para o vazio.
    /// </summary>
    public static string? NormalizePublicKey(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        var texto = raw.Replace("-----BEGIN PUBLIC KEY-----", string.Empty)
            .Replace("-----END PUBLIC KEY-----", string.Empty);
        var limpo = new StringBuilder(texto.Length);
        foreach (var c in texto)
        {
            if (!char.IsWhiteSpace(c))
                limpo.Append(c);
        }

        return limpo.Length > 0 ? limpo.ToString() : null;
    }

    /// <summary>
    /// Importa a chave publica (SPKI em base64) e confere que e ECDSA P-256. Recusa com
    /// a mensagem que a tela mostra; quem chama descarta a chave depois.
    /// </summary>
    public static ECDsa ImportPublicKey(string spkiBase64)
    {
        const string Recusa = "A chave publica precisa ser ECDSA P-256, no formato SPKI em base64 ou PEM.";

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(spkiBase64);
        }
        catch (FormatException)
        {
            throw new ArgumentException(Recusa);
        }

        var ecdsa = ECDsa.Create();
        try
        {
            ecdsa.ImportSubjectPublicKeyInfo(bytes, out var lidos);
            if (lidos != bytes.Length)
                throw new ArgumentException(Recusa);

            var curva = ecdsa.ExportParameters(false).Curve;
            if (curva.Oid?.Value != P256Oid && ecdsa.KeySize != 256)
                throw new ArgumentException(Recusa);
        }
        catch (Exception excecao) when (excecao is CryptographicException or ArgumentException)
        {
            ecdsa.Dispose();
            throw new ArgumentException(Recusa);
        }

        return ecdsa;
    }

    /// <summary>Um sal novo para o projeto, 32 bytes em base64.</summary>
    public static string NewSalt() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    /// <summary>
    /// O hash que representa a pessoa deste projeto: SHA-256 do sal do projeto e do
    /// <c>sub</c>, em hexadecimal. Mesma pessoa, mesmo projeto, mesmo hash; outro
    /// projeto, outro sal, outro hash.
    /// </summary>
    public static string SubjectHash(ProjectIdentitySettings settings, string subject)
    {
        var sal = settings.IdentitySubjectSalt ?? string.Empty;
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{sal}\n{subject}"));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    /// <summary>
    /// Confere o token contra a chave do projeto. Devolve nulo para qualquer engano —
    /// sem token, grande demais, projeto sem chave, assinatura errada, <c>alg</c> que
    /// nao e ES256, audiencia diferente da chave publica apresentada, vencido, ainda
    /// nao valido, sem <c>sub</c>, vida maior que o teto. Quem chama decide o que o
    /// nulo vira: relato sem identidade ou recusa, conforme a configuracao.
    /// </summary>
    public static async Task<Claims?> VerifyAsync(string? token, ProjectIdentitySettings settings, string? audience, DateTime now)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > MaxTokenLength)
            return null;
        if (string.IsNullOrWhiteSpace(settings.IdentityPublicKey) || string.IsNullOrWhiteSpace(audience))
            return null;

        ECDsa ecdsa;
        try
        {
            ecdsa = ImportPublicKey(settings.IdentityPublicKey);
        }
        catch (ArgumentException)
        {
            return null;
        }

        using (ecdsa)
        {
            // **Sem o cache de verificadores da biblioteca, de proposito.** Ela guarda o
            // verificador pela impressao digital da chave — a mesma a cada pedido do mesmo
            // projeto —, e o verificador guardado segura o ECDsa do primeiro pedido, que o
            // `using` acima descarta. O pedido seguinte recebia um verificador com a chave
            // ja descartada, ele falhava e saia do cache, e o outro voltava a funcionar: o
            // mesmo cracha valido era reconhecido um pedido sim, um nao.
            var semCache = new CryptoProviderFactory { CacheSignatureProviders = false };
            var handler = new JsonWebTokenHandler { MapInboundClaims = false };
            var parametros = new TokenValidationParameters
            {
                CryptoProviderFactory = semCache,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new ECDsaSecurityKey(ecdsa) { CryptoProviderFactory = semCache },
                ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256],
                RequireSignedTokens = true,
                ValidateIssuer = false,
                ValidateAudience = true,
                ValidAudience = audience.Trim(),
                ValidateLifetime = true,
                RequireExpirationTime = true,
                ClockSkew = TimeSpan.Zero,
            };

            TokenValidationResult resultado;
            try
            {
                resultado = await handler.ValidateTokenAsync(token, parametros);
            }
            catch (Exception)
            {
                return null;
            }

            if (!resultado.IsValid || resultado.SecurityToken is not JsonWebToken jwt)
                return null;

            // O teto e do projeto: um token que vale por horas e um token de login
            // disfarcado, e e exatamente o que este modo recusa.
            if (jwt.ValidTo > now.AddMinutes(settings.IdentityTokenMaxMinutes))
                return null;

            var subject = jwt.Subject?.Trim();
            if (string.IsNullOrEmpty(subject) || subject.Length > MaxSubjectLength)
                return null;

            string? nome = null;
            if (jwt.TryGetClaim("name", out var claimNome) && !string.IsNullOrWhiteSpace(claimNome.Value))
            {
                nome = claimNome.Value.Trim();
                if (nome.Length > MaxNameLength)
                    nome = nome[..MaxNameLength];
            }

            return new Claims(subject, nome);
        }
    }
}
