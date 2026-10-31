using Microsoft.EntityFrameworkCore;
using Pds.Data.Context;

namespace Pds.WebApi.Realtime;

/// <summary>
/// Fecha, a cada meio minuto, as conexoes em tempo real cuja sessao acabou: a que venceu e
/// a da pessoa que saiu (<c>sessions_revoked_at</c> depois da emissao da sessao, a mesma
/// regra das rotas REST) ou que foi apagada.
///
/// <para><b>Uma consulta por volta</b>, para todas as pessoas conectadas de uma vez, escrita
/// a mao como a do acesso (<c>AccountMiddleware</c>): nao ha sessao aqui para o filtro global,
/// entao a exclusao logica vai nas condicoes.</para>
///
/// <para>Meio minuto e o atraso maximo entre o "sair" e a conexao fechar. Os avisos levam so
/// identificadores, e a tela de quem saiu ja desligou o tempo real do proprio lado; isto
/// fecha a conexao que ficou aberta em outro lugar, como a de uma sessao roubada.</para>
/// </summary>
public sealed class RealtimeSessionSweeper : BackgroundService
{
    private static readonly TimeSpan Intervalo = TimeSpan.FromSeconds(30);

    private readonly RealtimeConnections _conexoes;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<RealtimeSessionSweeper> _logger;

    public RealtimeSessionSweeper(RealtimeConnections conexoes, IServiceScopeFactory scopes, ILogger<RealtimeSessionSweeper> logger)
    {
        _conexoes = conexoes;
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var relogio = new PeriodicTimer(Intervalo);

        while (await relogio.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (Exception erro) when (erro is not OperationCanceledException)
            {
                // Uma volta que falha nao para as proximas: o banco pode ter piscado.
                _logger.LogWarning("Falha ao conferir as sessoes do tempo real: {Erro}.", erro.GetType().Name);
            }
        }
    }

    private async Task SweepAsync(CancellationToken cancellationToken)
    {
        var abertas = _conexoes.Snapshot();
        if (abertas.Count == 0)
            return;

        var agora = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var vencidas = abertas.Where(conexao => RealtimeConnections.Expired(conexao.SessionExpiresAt, agora)).ToList();
        foreach (var conexao in vencidas)
            _conexoes.Close(conexao);

        var vivas = abertas.Except(vencidas).ToList();
        if (vivas.Count == 0)
        {
            Report(vencidas.Count, 0);
            return;
        }

        var pessoas = vivas.Select(conexao => conexao.UserPublicId).Distinct().ToArray();

        await using var escopo = _scopes.CreateAsyncScope();
        var dados = escopo.ServiceProvider.GetRequiredService<DataContext>();
        var sessoes = await dados.Database
            .SqlQuery<SessaoDaPessoa>($"""
                SELECT u.public_id AS "PublicId", u.sessions_revoked_at AS "SessionsRevokedAt"
                FROM users AS u
                JOIN accounts AS a ON a.id = u.account_id AND a.deleted_at IS NULL
                WHERE u.public_id = ANY({pessoas}) AND u.deleted_at IS NULL
                """)
            .ToDictionaryAsync(sessao => sessao.PublicId, sessao => sessao.SessionsRevokedAt, cancellationToken);

        var encerradas = 0;
        foreach (var conexao in vivas)
        {
            // Apagada (ou sem conta): nao existe mais. Saiu depois de a sessao ser emitida: ela
            // acabou, como nas rotas REST (AccountMiddleware.SessionWasRevoked).
            var encerrou = !sessoes.TryGetValue(conexao.UserPublicId, out var saiuEm)
                           || RealtimeConnections.Revoked(conexao.SessionIssuedAt, saiuEm);
            if (!encerrou)
                continue;

            _conexoes.Close(conexao);
            encerradas++;
        }

        Report(vencidas.Count, encerradas);
    }

    private void Report(int vencidas, int encerradas)
    {
        if (vencidas + encerradas > 0)
            _logger.LogInformation(
                "Tempo real: {Vencidas} conexao(oes) de sessao vencida e {Encerradas} de sessao encerrada fechadas.",
                vencidas, encerradas);
    }

    private sealed record SessaoDaPessoa(Guid PublicId, DateTime? SessionsRevokedAt);
}
