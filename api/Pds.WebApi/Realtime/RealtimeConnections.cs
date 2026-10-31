using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace Pds.WebApi.Realtime;

/// <summary>
/// As conexoes abertas do hub, com o que e preciso para fecha-las quando a sessao acaba:
/// de quem sao, quando a sessao que pediu o bilhete foi emitida e ate quando ela vale.
///
/// <para><b>Por que guardar.</b> O hub so confere o bilhete ao abrir; depois, a conexao
/// viveria o quanto o navegador quisesse, mesmo com a pessoa tendo saido ou com a sessao
/// vencida. Quem fecha e o <see cref="RealtimeSessionSweeper"/>, com o que fica aqui.</para>
///
/// <para>Cada processo guarda as proprias conexoes: com mais de uma replica da API, cada
/// uma fecha as suas, e a regra continua valendo sem nada compartilhado.</para>
/// </summary>
public sealed class RealtimeConnections
{
    private readonly ConcurrentDictionary<string, Open> _abertas = new();

    /// <summary>Uma conexao aberta.</summary>
    /// <param name="Context">A conexao, para fecha-la.</param>
    /// <param name="UserPublicId">De quem e.</param>
    /// <param name="SessionIssuedAt">Quando a sessao que pediu o bilhete foi emitida, em segundos.</param>
    /// <param name="SessionExpiresAt">Ate quando vale essa sessao, em segundos.</param>
    public sealed record Open(HubCallerContext Context, Guid UserPublicId, long SessionIssuedAt, long SessionExpiresAt);

    public void Add(Open conexao) => _abertas[conexao.Context.ConnectionId] = conexao;

    public void Remove(string connectionId) => _abertas.TryRemove(connectionId, out _);

    /// <summary>Uma foto das abertas agora: quem varre nao segura nada enquanto consulta o banco.</summary>
    public IReadOnlyList<Open> Snapshot() => [.. _abertas.Values];

    /// <summary>Se a sessao ja tinha vencido em <paramref name="agora"/> (segundos).</summary>
    public static bool Expired(long sessionExpiresAt, long agora) => sessionExpiresAt <= agora;

    /// <summary>
    /// Se a pessoa saiu depois de a sessao ser emitida: a mesma regra das rotas REST
    /// (<c>AccountMiddleware.SessionWasRevoked</c>), com o <c>iat</c> da sessao, e nao o do bilhete.
    /// </summary>
    public static bool Revoked(long sessionIssuedAt, DateTime? revokedAt)
        => revokedAt is { } instante
           && sessionIssuedAt < new DateTimeOffset(DateTime.SpecifyKind(instante, DateTimeKind.Utc)).ToUnixTimeSeconds();

    /// <summary>Fecha a conexao do lado do servidor. O painel tenta reabrir, e o bilhete novo e recusado.</summary>
    public void Close(Open conexao)
    {
        conexao.Context.Abort();
        Remove(conexao.Context.ConnectionId);
    }
}
