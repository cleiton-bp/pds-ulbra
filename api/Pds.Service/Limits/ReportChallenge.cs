using System.Security.Cryptography;
using System.Text;

namespace Pds.Service.Limits;

/// <summary>
/// O desafio invisivel da entrada de relatos: uma conta que o navegador de quem relata
/// resolve em um ou dois segundos, e que a API confere numa so.
///
/// <para><b>Prova de trabalho, e nao servico de fora.</b> Nada de chave de terceiro,
/// nada do visitante indo para outro lugar: a API assina um bilhete, e o navegador
/// procura um numero (<c>nonce</c>) tal que o SHA-256 de <c>bilhete + nonce</c> comece
/// com <see cref="Difficulty"/> bits zero. Para uma pessoa e um "Conferindo..." de um
/// segundo, uma vez, so depois de passar do limite; para quem manda centenas, e um
/// segundo de processador por relato — o que acaba com a rajada barata.</para>
///
/// <para><b>O bilhete e assinado (HMAC-SHA256) e diz tudo o que a API precisa</b>:
/// o projeto, um resumo de quem pediu (nunca o IP em claro), quando vence (dois
/// minutos) e a dificuldade. Assinado, ninguem baixa a dificuldade nem estica o
/// prazo; com o resumo, o bilhete de um nao serve a outro; e o identificador aleatorio
/// e o que deixa usar uma vez so (<see cref="ReportLimiter"/> guarda os usados ate
/// vencerem).</para>
///
/// <para><b>A chave sai da <c>JWT_SIGNING_KEY</c></b>, derivada por HMAC com um rotulo
/// proprio: nao ha variavel nova para configurar, e o bilhete do desafio nunca vale
/// como token de sessao nem o contrario — as duas assinaturas usam chaves diferentes.
/// Trocar a chave do JWT invalida os desafios em voo, que vencem em dois minutos de
/// qualquer jeito.</para>
/// </summary>
public static class ReportChallenge
{
    /// <summary>
    /// Bits zero no comeco do hash. Dezoito sao, em media, 262 mil tentativas: perto de
    /// um quarto de segundo num computador e de um a dois segundos num celular comum,
    /// com o SHA-256 escrito em JavaScript que a ferramenta usa.
    /// </summary>
    public const int Difficulty = 18;

    /// <summary>Quanto o bilhete vale. Folga para o celular lento, curto para nao virar estoque.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(2);

    /// <summary>A versao do formato, no comeco do bilhete.</summary>
    private const string Version = "c1";

    /// <summary>Teto do nonce em digitos: nenhuma busca honesta passa disso.</summary>
    private const int MaxNonceLength = 16;

    /// <summary>Um bilhete emitido.</summary>
    public readonly record struct Issued(string Token, int Difficulty, DateTime ExpiresAt);

    /// <summary>A chave do desafio, derivada da chave de assinatura do JWT.</summary>
    public static byte[] DeriveKey(string jwtSigningKey)
        => HMACSHA256.HashData(Encoding.UTF8.GetBytes(jwtSigningKey), Encoding.UTF8.GetBytes("pds:report-challenge:v1"));

    /// <summary>
    /// O resumo de quem pediu, para o bilhete: os primeiros 16 caracteres do SHA-256 do
    /// projeto com a chave de quem relata. O IP nao sai em claro nem no bilhete.
    /// </summary>
    public static string Binding(long projectId, string requester)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{projectId}:{requester}")))[..16].ToLowerInvariant();

    /// <summary>Emite um bilhete novo para este projeto e quem pediu.</summary>
    public static Issued Issue(byte[] key, Guid projectPublicId, string binding, DateTime now)
    {
        var expiresAt = now.Add(Lifetime);
        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant();
        var payload = string.Join('.',
            Version,
            projectPublicId.ToString("N"),
            binding,
            new DateTimeOffset(DateTime.SpecifyKind(expiresAt, DateTimeKind.Utc)).ToUnixTimeSeconds(),
            Difficulty,
            id);

        return new Issued($"{payload}.{Sign(key, payload)}", Difficulty, expiresAt);
    }

    /// <summary>
    /// Confere o bilhete e a resposta. Devolve o identificador do bilhete e quando ele
    /// vence (para guardar como usado), ou nulo quando qualquer coisa nao bate — a
    /// assinatura, o projeto, quem pediu, o prazo ou a conta.
    /// </summary>
    public static (string Id, DateTime ExpiresAt)? Verify(
        byte[] key, string? token, string? nonce, Guid projectPublicId, string binding, DateTime now)
    {
        if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(nonce)
            || nonce.Length > MaxNonceLength || !nonce.All(char.IsAsciiDigit))
            return null;

        var parts = token.Split('.');
        if (parts.Length != 7 || parts[0] != Version)
            return null;

        var payload = string.Join('.', parts[..6]);
        var esperado = Encoding.ASCII.GetBytes(Sign(key, payload));
        if (!CryptographicOperations.FixedTimeEquals(esperado, Encoding.ASCII.GetBytes(parts[6])))
            return null;

        if (parts[1] != projectPublicId.ToString("N") || parts[2] != binding)
            return null;

        if (!long.TryParse(parts[3], out var vence) || !int.TryParse(parts[4], out var dificuldade))
            return null;

        var expiresAt = DateTimeOffset.FromUnixTimeSeconds(vence).UtcDateTime;
        if (expiresAt <= now || dificuldade < Difficulty)
            return null;

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(token + nonce));
        return LeadingZeroBits(hash) >= dificuldade ? (parts[5], expiresAt) : null;
    }

    /// <summary>Quantos bits zero abrem o hash.</summary>
    public static int LeadingZeroBits(ReadOnlySpan<byte> hash)
    {
        var total = 0;
        foreach (var b in hash)
        {
            if (b == 0)
            {
                total += 8;
                continue;
            }

            return total + System.Numerics.BitOperations.LeadingZeroCount((uint)b) - 24;
        }

        return total;
    }

    private static string Sign(byte[] key, string payload)
        => Convert.ToBase64String(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(payload)))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
