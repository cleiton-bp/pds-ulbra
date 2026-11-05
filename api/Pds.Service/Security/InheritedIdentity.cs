using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Pds.Domain.Constants;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Service.Security;

/// <summary>
/// A identidade que vem do sistema do cliente, assinada por ele.
///
/// <para><b>Dois formatos, um por projeto</b> (<see cref="IdentityFormatEnum"/>), e nos
/// dois nos so conferimos a assinatura, sem nunca chamar o sistema do cliente.</para>
///
/// <para><b>A assinatura simples (HMAC)</b> e o padrao: o servidor do cliente calcula
/// HMAC-SHA256 de <c>id.expira</c> com a chave secreta do projeto, em uma linha de
/// qualquer linguagem. <b>A chave secreta nao e guardada</b>: ela sai da chave mestra da
/// instalacao (<c>IDENTITY_HMAC_KEY</c>, so no ambiente do servidor) e da versao do
/// projeto, e um vazamento do banco sozinho nao forja identidade nenhuma. O cracha chega
/// montado pelo carregador a partir dos atributos <c>data-user-*</c>
/// (<see cref="HmacPrefix"/>).</para>
///
/// <para><b>O JWT e assimetrico.</b> O cliente guarda a chave privada e nos da so a
/// publica (ECDSA P-256), e o banco nao tem nada que assine.</para>
///
/// <para><b>O token JWT e um ES256 dedicado</b>, emitido pelo servidor do cliente para
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
    /// O comeco do cracha HMAC, como o carregador o monta a partir dos atributos:
    /// <c>rfh1.{id em base64url}.{expira em segundos}.{assinatura em hex}[.{nome em base64url}]</c>.
    /// O nome nao entra na assinatura: ele so sugere o campo do nome, que a pessoa edita.
    /// </summary>
    public const string HmacPrefix = "rfh1.";

    /// <summary>A instalacao tem a chave mestra, e a assinatura simples pode ser usada.</summary>
    public static bool IsHmacAvailable => EnvironmentConstants.GetIdentityHmacKey() is not null;

    /// <summary>
    /// A chave secreta do HMAC deste projeto: HMAC-SHA256 da chave mestra sobre o projeto e
    /// a versao, em base64url com o prefixo <c>rfs_</c>. Nula sem a chave mestra. A mesma
    /// entrada da sempre a mesma chave, e por isso ela nao precisa ser guardada; subir a
    /// versao troca a chave.
    /// </summary>
    public static string? ProjectSecret(long projectId, int version)
    {
        var mestra = EnvironmentConstants.GetIdentityHmacKey();
        if (mestra is null)
            return null;

        var bytes = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(mestra),
            Encoding.UTF8.GetBytes($"relatofacil/identity-secret/v1\n{projectId.ToString(CultureInfo.InvariantCulture)}\n{version.ToString(CultureInfo.InvariantCulture)}"));

        return "rfs_" + Base64UrlEncoder.Encode(bytes);
    }

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

            // As duas condicoes, cada uma recusando sozinha: a curva nomeada P-256 e o tamanho
            // dela. Com um "e" no lugar do "ou", passava qualquer curva de 256 bits.
            var curva = ecdsa.ExportParameters(false).Curve;
            if (curva.Oid?.Value != P256Oid || ecdsa.KeySize != 256)
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

        // Um formato por projeto: o cracha do outro e recusado como qualquer cracha que
        // nao confere.
        if (settings.IdentityFormat == IdentityFormatEnum.Hmac)
            return VerifyHmac(token, settings, now);

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

    /// <summary>
    /// Confere o cracha HMAC. Devolve nulo para qualquer engano: formato errado, id vazio
    /// ou grande demais, validade vencida ou maior que o teto do projeto, instalacao sem a
    /// chave mestra, assinatura que nao confere. A comparacao e em tempo constante, para o
    /// tempo da resposta nao contar quantos caracteres da assinatura acertaram.
    /// </summary>
    private static Claims? VerifyHmac(string token, ProjectIdentitySettings settings, DateTime now)
    {
        if (!token.StartsWith(HmacPrefix, StringComparison.Ordinal))
            return null;

        var partes = token[HmacPrefix.Length..].Split('.');
        if (partes.Length is not (3 or 4))
            return null;

        var subject = FromBase64Url(partes[0]);
        if (string.IsNullOrWhiteSpace(subject) || subject.Length > MaxSubjectLength)
            return null;

        if (!long.TryParse(partes[1], NumberStyles.None, CultureInfo.InvariantCulture, out var expiraEm))
            return null;

        DateTime expira;
        try
        {
            expira = DateTimeOffset.FromUnixTimeSeconds(expiraEm).UtcDateTime;
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }

        // Vencido nao vale; valendo mais que o teto, e um cracha de login disfarcado.
        if (expira <= now || expira > now.AddMinutes(settings.IdentityTokenMaxMinutes))
            return null;

        byte[] recebida;
        try
        {
            recebida = Convert.FromHexString(partes[2]);
        }
        catch (FormatException)
        {
            return null;
        }

        var segredo = ProjectSecret(settings.ProjectId, settings.IdentitySecretVersion);
        if (segredo is null || recebida.Length != 32)
            return null;

        var esperada = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(segredo),
            Encoding.UTF8.GetBytes($"{subject}.{partes[1]}"));

        if (!CryptographicOperations.FixedTimeEquals(esperada, recebida))
            return null;

        string? nome = null;
        if (partes.Length == 4)
        {
            nome = FromBase64Url(partes[3])?.Trim();
            if (string.IsNullOrEmpty(nome))
                nome = null;
            else if (nome.Length > MaxNameLength)
                nome = nome[..MaxNameLength];
        }

        return new Claims(subject, nome);
    }

    /// <summary>O texto de um trecho em base64url (UTF-8), ou nulo se nao for base64url valido.</summary>
    private static string? FromBase64Url(string trecho)
    {
        if (trecho.Length == 0)
            return null;

        try
        {
            return Encoding.UTF8.GetString(Base64UrlEncoder.DecodeBytes(trecho));
        }
        catch (Exception excecao) when (excecao is FormatException or ArgumentException)
        {
            return null;
        }
    }
}
