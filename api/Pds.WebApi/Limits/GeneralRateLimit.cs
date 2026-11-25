using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using Pds.Domain.Constants;
using Pds.Domain.Security;
using Pds.Service.Services;
using Pds.Shared.Json;
using Pds.Shared.Models;
using Pds.WebApi.Realtime;

namespace Pds.WebApi.Limits;

/// <summary>
/// A contagem do limite geral de pedidos, na memoria do processo.
///
/// <para><b>Cada um com a sua contagem.</b> Sem login, a chave e o IP (no IPv6, o bloco /64,
/// que e o que uma maquina so controla); com login, a conta. Quem passa do limite e barrado
/// sozinho: as outras pessoas, no mesmo minuto, continuam usando normalmente.</para>
///
/// <para><b>O bloqueio cresce para quem insiste</b>, e so para ele. A primeira vez espera um
/// minuto; cada nova vez, pouco depois, espera mais (os minutos vem da configuracao). Sem
/// passar do limite por um tempo, as vezes anteriores sao esquecidas.</para>
///
/// <para><b>Na memoria, como os outros limites</b>: uma instancia so da API, e reiniciar zera
/// as contagens. Os registros parados saem numa faxina de minuto em minuto, para a lista nao
/// crescer sem fim durante um ataque de muitos enderecos.</para>
/// </summary>
public sealed class GeneralRateLimiter
{
    private readonly ConcurrentDictionary<string, Contagem> _contagens = new();
    private readonly TimeProvider _relogio;
    private long _proximaFaxina;

    public GeneralRateLimiter(TimeProvider relogio)
    {
        _relogio = relogio;
    }

    /// <summary>O que fazer com o pedido: seguir, ou recusar e por quanto tempo.</summary>
    /// <param name="Permitido">Segue para a rota.</param>
    /// <param name="Espera">Quanto falta para poder de novo, na recusa.</param>
    /// <param name="BloqueioNovo">Este pedido foi o que passou do limite agora.</param>
    /// <param name="Vez">Quantas vezes seguidas a chave passou do limite.</param>
    public readonly record struct Decisao(bool Permitido, TimeSpan Espera, bool BloqueioNovo, int Vez);

    public Decisao Contar(string chave, int limitePorMinuto, IReadOnlyList<int> punicoesEmMinutos, int esquecerEmMinutos)
    {
        var agora = _relogio.GetUtcNow();
        Faxinar(agora, punicoesEmMinutos, esquecerEmMinutos);

        var contagem = _contagens.GetOrAdd(chave, _ => new Contagem(agora));
        lock (contagem)
        {
            contagem.UltimoPedido = agora;

            if (contagem.BarradoAte > agora)
                return new Decisao(false, contagem.BarradoAte - agora, false, contagem.Vezes);

            if (contagem.Vezes > 0 && agora - contagem.UltimaVez > TimeSpan.FromMinutes(esquecerEmMinutos))
                contagem.Vezes = 0;

            if (agora - contagem.InicioDoMinuto >= UmMinuto)
            {
                contagem.InicioDoMinuto = agora;
                contagem.Pedidos = 0;
            }

            contagem.Pedidos++;
            if (contagem.Pedidos <= limitePorMinuto)
                return new Decisao(true, TimeSpan.Zero, false, contagem.Vezes);

            // Passou do limite: barrado, por mais tempo a cada vez seguida.
            contagem.Vezes++;
            contagem.UltimaVez = agora;
            var minutos = punicoesEmMinutos[Math.Min(contagem.Vezes, punicoesEmMinutos.Count) - 1];
            var espera = TimeSpan.FromMinutes(minutos);
            contagem.BarradoAte = agora + espera;
            // Ao voltar, um minuto novo, e nao o resto do que estourou.
            contagem.InicioDoMinuto = contagem.BarradoAte;
            contagem.Pedidos = 0;
            return new Decisao(false, espera, true, contagem.Vezes);
        }
    }

    /// <summary>Tira quem parou de pedir e ja nao esta barrado nem tem vezes a lembrar.</summary>
    private void Faxinar(DateTimeOffset agora, IReadOnlyList<int> punicoesEmMinutos, int esquecerEmMinutos)
    {
        var marca = agora.ToUnixTimeMilliseconds();
        var proxima = Interlocked.Read(ref _proximaFaxina);
        if (marca < proxima || Interlocked.CompareExchange(ref _proximaFaxina, marca + 60_000, proxima) != proxima)
            return;

        var guardar = TimeSpan.FromMinutes(Math.Max(esquecerEmMinutos, punicoesEmMinutos.Max()));
        foreach (var (chave, contagem) in _contagens)
        {
            lock (contagem)
            {
                if (contagem.BarradoAte <= agora && agora - contagem.UltimoPedido > guardar)
                    _contagens.TryRemove(chave, out _);
            }
        }
    }

    private static readonly TimeSpan UmMinuto = TimeSpan.FromMinutes(1);

    private sealed class Contagem(DateTimeOffset agora)
    {
        public DateTimeOffset InicioDoMinuto = agora;
        public int Pedidos;
        public int Vezes;
        public DateTimeOffset UltimaVez = DateTimeOffset.MinValue;
        public DateTimeOffset BarradoAte = DateTimeOffset.MinValue;
        public DateTimeOffset UltimoPedido = agora;
    }
}

/// <summary>
/// O limite geral de pedidos, na porta da API: por IP sem login, por conta com login.
///
/// <para><b>So na VPS, por padrao.</b> No desenvolvimento fica desligado (ver
/// <see cref="EnvironmentConstants.GetGeneralRateLimitEnabled"/>), e a variavel liga para testar.</para>
///
/// <para><b>Depois da autenticacao</b>, para saber se o pedido e de uma conta (o token ja
/// conferido); e antes da autorizacao, para contar tambem quem martela sem token. O CORS vem
/// antes, e a recusa leva os cabecalhos dele: a tela le "muitas tentativas", e nao "falha de rede".</para>
///
/// <para><b>Fica de fora</b> o que tem a propria guarda ou nao pode ser barrado: a checagem de
/// saude (o Docker pergunta por ela), os hubs do tempo real (o do time abre com bilhete, e o
/// de quem relatou tem limite proprio) e o OPTIONS do navegador. Os limites que ja existiam
/// (login, anexos, acompanhamento ao vivo) continuam iguais, e valem junto com este.</para>
/// </summary>
public sealed class GeneralRateLimitMiddleware
{
    private readonly RequestDelegate _next;
    private readonly GeneralRateLimiter _limiter;
    private readonly ILogger<GeneralRateLimitMiddleware> _logger;
    private readonly bool _ligado;
    private readonly int _semLogin;
    private readonly int _comLogin;
    private readonly IReadOnlyList<int> _punicoes;
    private readonly int _esquecer;

    public GeneralRateLimitMiddleware(
        RequestDelegate next,
        GeneralRateLimiter limiter,
        IHostEnvironment ambiente,
        ILogger<GeneralRateLimitMiddleware> logger)
    {
        _next = next;
        _limiter = limiter;
        _logger = logger;
        _ligado = EnvironmentConstants.GetGeneralRateLimitEnabled() ?? !ambiente.IsDevelopment();
        _semLogin = EnvironmentConstants.GetGeneralRateLimitAnonymousPerMinute();
        _comLogin = EnvironmentConstants.GetGeneralRateLimitAccountPerMinute();
        _punicoes = EnvironmentConstants.GetGeneralRateLimitPenaltyMinutes();
        _esquecer = EnvironmentConstants.GetGeneralRateLimitForgetMinutes();
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_ligado || ForaDoLimite(context.Request))
        {
            await _next(context);
            return;
        }

        var (chave, limite, deConta) = QuemPede(context);
        var decisao = _limiter.Contar(chave, limite, _punicoes, _esquecer);
        if (decisao.Permitido)
        {
            await _next(context);
            return;
        }

        // A partir da segunda vez seguida e insistencia, e vale o aviso no log. Sem o IP: o
        // sistema nao guarda endereco de ninguem.
        if (decisao.BloqueioNovo && decisao.Vez >= 2)
            _logger.LogWarning(
                "Limite geral: {Quem} passou do limite pela {Vez}a vez seguida e ficou barrado por {Minutos} min.",
                deConta ? "uma conta" : "um endereco", decisao.Vez, (int)Math.Ceiling(decisao.Espera.TotalMinutes));

        await Recusar(context, decisao.Espera);
    }

    private static bool ForaDoLimite(HttpRequest pedido)
        => HttpMethods.IsOptions(pedido.Method)
           || pedido.Path.StartsWithSegments("/health")
           || pedido.Path.StartsWithSegments(RealtimeTicket.HubPath)
           || pedido.Path.StartsWithSegments(LiveTracking.HubPath);

    /// <summary>A conta, quando o token ja conferido diz qual; senao, o IP.</summary>
    private (string Chave, int Limite, bool DeConta) QuemPede(HttpContext context)
    {
        var conta = context.User.Identity?.IsAuthenticated == true
            ? context.User.FindFirst(TokenService.UserClaim)?.Value
            : null;
        return conta is { Length: > 0 }
            ? ($"conta:{conta}", _comLogin, true)
            : ($"ip:{Endereco(context.Connection.RemoteIpAddress)}", _semLogin, false);
    }

    /// <summary>
    /// O endereco que conta. No IPv6, o bloco /64: uma maquina so troca de endereco dentro dele
    /// a vontade, e contar endereco por endereco deixaria ela escapar do limite.
    /// </summary>
    private static string Endereco(IPAddress? ip)
    {
        if (ip is null)
            return "desconhecido";
        if (ip.IsIPv4MappedToIPv6)
            return ip.MapToIPv4().ToString();
        if (ip.AddressFamily != AddressFamily.InterNetworkV6)
            return ip.ToString();
        var bytes = ip.GetAddressBytes();
        Array.Clear(bytes, 8, 8);
        return $"{new IPAddress(bytes)}/64";
    }

    private static async Task Recusar(HttpContext context, TimeSpan espera)
    {
        var minutos = Math.Max(1, (int)Math.Ceiling(espera.TotalMinutes));
        context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.Response.ContentType = "application/json; charset=utf-8";
        context.Response.Headers.RetryAfter = ((int)Math.Ceiling(espera.TotalSeconds)).ToString();

        var corpo = new ApiResponse<object>(
            Success: false,
            Message: $"Muitas tentativas. Espere {minutos} {(minutos == 1 ? "minuto" : "minutos")} e tente de novo.",
            Data: null);
        await context.Response.WriteAsync(
            JsonSerializer.Serialize(corpo, PdsJsonOptions.Create()), context.RequestAborted);
    }
}
