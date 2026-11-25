using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Json;

namespace Pds.WebApi.Realtime;

/// <summary>
/// Quem esta acompanhando um relato ao vivo, e o aviso que vai para essas telas.
///
/// <para><b>So existe quem esta olhando.</b> A tela do relato se inscreve ao abrir
/// (<see cref="TrackingHub"/>) e sai ao fechar. Sem ninguem inscrito, o aviso de card mudado
/// para na primeira linha de <see cref="Changed"/>: nenhuma consulta, nenhum envio.</para>
///
/// <para><b>So sai o que a pessoa veria.</b> Cada mudanca de card remonta o relato como a
/// pagina de acompanhamento mostra e compara com o ultimo que foi para aquelas telas. Igual,
/// nada sai: etiqueta, responsavel, comentario interno e coluna que leva a mesma etapa nao
/// geram aviso, e assim nem o momento da atividade interna do time chega a quem relatou.</para>
///
/// <para><b>Separado por quem age e quem le.</b> O link confirma, reabre e responde; o codigo
/// e o cracha so leem. Cada lado tem o seu grupo e a sua versao do relato, e nenhum recebe
/// uma acao que nao tem.</para>
///
/// <para><b>Uma instancia so</b>, como o hub do painel: os grupos e este registro moram na
/// memoria deste processo (ver <see cref="HubWorkNotifier"/>).</para>
/// </summary>
public sealed class LiveTracking
{
    /// <summary>O endereco do hub publico.</summary>
    public const string HubPath = "/realtime/tracking";

    /// <summary>O aviso que a tela do relato recebe, com o relato inteiro como ela mostra.</summary>
    public const string Method = "ReportUpdated";

    /// <summary>
    /// Quanto o aviso espera para sair. Um pedido do painel pode mudar o card mais de uma vez
    /// (mover e comentar), e as mudancas juntas viram um aviso so.
    /// </summary>
    public static readonly TimeSpan Juntar = TimeSpan.FromMilliseconds(300);

    /// <summary>O mais que remontar e mandar pode levar. Passou, fica para a proxima mudanca.</summary>
    public static readonly TimeSpan Prazo = TimeSpan.FromSeconds(5);

    private readonly ConcurrentDictionary<Guid, Acompanhado> _relatos = new();
    private readonly ConcurrentDictionary<string, Guid> _conexoes = new();
    private readonly ConcurrentDictionary<Guid, byte> _pendentes = new();
    private readonly IServiceScopeFactory _escopos;
    private readonly IHubContext<TrackingHub> _hub;
    private readonly ILogger<LiveTracking> _logger;

    public LiveTracking(IServiceScopeFactory escopos, IHubContext<TrackingHub> hub, ILogger<LiveTracking> logger)
    {
        _escopos = escopos;
        _hub = hub;
        _logger = logger;
    }

    /// <summary>O grupo das telas de um relato, de um lado: as que agem, ou as que so leem.</summary>
    public static string GroupOf(Guid reportPublicId, bool canAct) => $"r:{reportPublicId:N}:{(canAct ? "a" : "l")}";

    /// <summary>A conexao passou a acompanhar o relato, que ela acabou de receber como esta.</summary>
    public void Add(string connectionId, LiveTrackingAccess acesso)
    {
        var assinatura = Assinatura(acesso.Report);

        // O registro do relato pode estar sendo desfeito agora, pela ultima conexao saindo:
        // nesse caso, entra num novo.
        while (true)
        {
            var acompanhado = _relatos.GetOrAdd(acesso.ReportPublicId, _ => new Acompanhado(acesso.TrackingCode));
            if (acompanhado.Entrar(connectionId, acesso.CanAct, assinatura))
                break;
            _relatos.TryRemove(new KeyValuePair<Guid, Acompanhado>(acesso.ReportPublicId, acompanhado));
        }

        _conexoes[connectionId] = acesso.ReportPublicId;
    }

    /// <summary>A conexao fechou. A ultima a sair desfaz o registro do relato.</summary>
    public void Remove(string connectionId)
    {
        if (!_conexoes.TryRemove(connectionId, out var relato))
            return;

        if (_relatos.TryGetValue(relato, out var acompanhado) && acompanhado.Sair(connectionId))
            _relatos.TryRemove(new KeyValuePair<Guid, Acompanhado>(relato, acompanhado));
    }

    /// <summary>
    /// Um card mudou. Sem ninguem acompanhando, termina aqui. Com alguem, o aviso sai fora do
    /// pedido de quem mudou, depois de <see cref="Juntar"/>, uma vez so para as mudancas juntas.
    /// </summary>
    public void Changed(Guid reportPublicId)
    {
        if (!_relatos.ContainsKey(reportPublicId))
            return;

        if (!_pendentes.TryAdd(reportPublicId, 0))
            return;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(Juntar);
                _pendentes.TryRemove(reportPublicId, out _);
                await AtualizarAsync(reportPublicId);
            }
            catch (Exception falha)
            {
                // A mudanca esta gravada; quem esta olhando so a ve quando reabrir o relato.
                _logger.LogWarning(falha, "Aviso ao vivo do relato {PublicId} nao saiu.", reportPublicId);
            }
        });
    }

    private async Task AtualizarAsync(Guid reportPublicId)
    {
        if (!_relatos.TryGetValue(reportPublicId, out var acompanhado))
            return;

        using var prazo = new CancellationTokenSource(Prazo);

        // Um escopo proprio: o pedido de quem mudou o card ja pode ter terminado, e o banco
        // dele junto.
        await using var escopo = _escopos.CreateAsyncScope();
        var relatos = escopo.ServiceProvider.GetRequiredService<IReportService>();

        foreach (var podeAgir in acompanhado.Lados())
        {
            var atual = await relatos.BuildLiveTrackingAsync(acompanhado.TrackingCode, podeAgir, prazo.Token);
            if (atual is null)
                continue;

            if (!acompanhado.Trocar(podeAgir, Assinatura(atual)))
                continue;

            await _hub.Clients.Group(GroupOf(reportPublicId, podeAgir)).SendAsync(Method, atual, prazo.Token);
        }
    }

    /// <summary>A impressao do relato como sai para a tela: igual, a tela nao mudaria.</summary>
    private static string Assinatura(PublicReportViewModel relato)
        => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(relato, PdsJsonOptions.Create())));

    /// <summary>As telas de um relato, de cada lado, e o ultimo relato que foi para cada lado.</summary>
    private sealed class Acompanhado(string trackingCode)
    {
        private readonly object _trava = new();
        private readonly Dictionary<string, bool> _conexoes = new();
        private string? _ultimoQueAge;
        private string? _ultimoQueLe;
        private bool _desfeito;

        public string TrackingCode { get; } = trackingCode;

        /// <summary>Falso quando o registro ja foi desfeito: quem chama entra num novo.</summary>
        public bool Entrar(string connectionId, bool podeAgir, string assinatura)
        {
            lock (_trava)
            {
                if (_desfeito)
                    return false;

                _conexoes[connectionId] = podeAgir;
                // A tela que entra recebeu o relato de agora: ele passa a ser o ultimo daquele lado.
                if (podeAgir) _ultimoQueAge = assinatura;
                else _ultimoQueLe = assinatura;
                return true;
            }
        }

        /// <summary>Verdadeiro quando era a ultima conexao: o registro fica desfeito.</summary>
        public bool Sair(string connectionId)
        {
            lock (_trava)
            {
                _conexoes.Remove(connectionId);
                if (_conexoes.Count > 0)
                    return false;

                _desfeito = true;
                return true;
            }
        }

        /// <summary>Os lados com alguem olhando agora.</summary>
        public IReadOnlyList<bool> Lados()
        {
            lock (_trava)
                return _conexoes.Values.Distinct().ToList();
        }

        /// <summary>Guarda a nova versao do lado e diz se ela mudou.</summary>
        public bool Trocar(bool podeAgir, string assinatura)
        {
            lock (_trava)
            {
                var anterior = podeAgir ? _ultimoQueAge : _ultimoQueLe;
                if (anterior == assinatura)
                    return false;

                if (podeAgir) _ultimoQueAge = assinatura;
                else _ultimoQueLe = assinatura;
                return true;
            }
        }
    }
}
