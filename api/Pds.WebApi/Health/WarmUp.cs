using Microsoft.EntityFrameworkCore;
using Pds.Data.Context;

namespace Pds.WebApi.Health;

/// <summary>
/// O aquecimento da API recem-subida: o que o primeiro pedido pagaria sozinho e feito
/// antes de a sonda de prontidao deixar o trafego chegar (ver
/// <see cref="Controllers.HealthController"/>).
///
/// <para><b>O que esquenta:</b> o modelo do EF — o mais caro do arranque — e as primeiras
/// conexoes com o banco, que ficam no pool para a primeira leva de pedidos. A compilacao
/// do codigo vem pronta da imagem (ReadyToRun, ver o <c>Dockerfile</c>).</para>
///
/// <para><b>Em segundo plano</b>, e nao antes de a porta abrir: a sonda de vida responde
/// desde o primeiro instante, e so a de prontidao espera. Com o banco fora no arranque, o
/// aquecimento tenta de novo, com espera crescente — a API fica viva e nao pronta, e nao
/// entra em laco de reinicio por causa do banco.</para>
/// </summary>
public sealed class WarmUp : BackgroundService
{
    /// <summary>
    /// Quantas conexoes ficam abertas: o painel abre uma tela com uma leva de pedidos de
    /// uma vez, e cada um precisa da sua. As que ninguem usar o pool fecha depois de
    /// ociosas.
    /// </summary>
    private const int Conexoes = 4;

    /// <summary>A espera mais longa entre duas tentativas, com o banco fora.</summary>
    private static readonly TimeSpan EsperaMaxima = TimeSpan.FromSeconds(30);

    private readonly IServiceScopeFactory _escopos;
    private readonly ILogger<WarmUp> _logger;
    private volatile bool _pronta;

    public WarmUp(IServiceScopeFactory escopos, ILogger<WarmUp> logger)
    {
        _escopos = escopos;
        _logger = logger;
    }

    /// <summary>Se o aquecimento ja terminou. Ate la, a sonda de prontidao diz que nao.</summary>
    public bool Done => _pronta;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        for (var tentativa = 1; ; tentativa++)
        {
            try
            {
                await Task.WhenAll(Enumerable.Range(0, Conexoes).Select(_ => AbrirConexaoAsync(stoppingToken)));
                _pronta = true;
                return;
            }
            catch (Exception falha) when (!stoppingToken.IsCancellationRequested)
            {
                var espera = TimeSpan.FromSeconds(Math.Min(EsperaMaxima.TotalSeconds, Math.Pow(2, tentativa)));
                _logger.LogWarning(falha,
                    "O aquecimento falhou (tentativa {Tentativa}); de novo em {Espera} s. A API fica viva e nao pronta.",
                    tentativa, espera.TotalSeconds);
                await Task.Delay(espera, stoppingToken);
            }
        }
    }

    /// <summary>
    /// Uma conexao aberta e devolvida ao pool. A consulta monta o modelo do EF e passa pelo
    /// caminho inteiro de uma consulta; sem sessao, o filtro global nao ve nada — e e so o
    /// caminho que importa.
    /// </summary>
    private async Task AbrirConexaoAsync(CancellationToken cancellationToken)
    {
        using var escopo = _escopos.CreateScope();
        var banco = escopo.ServiceProvider.GetRequiredService<DataContext>();
        await banco.Users.AsNoTracking().AnyAsync(cancellationToken);
    }
}
