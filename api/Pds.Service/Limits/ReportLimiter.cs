using Pds.Domain.Constants;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Service.Limits;

/// <summary>
/// As camadas de limite da entrada de relatos, contadas na memoria do processo.
///
/// <para><b>Quatro camadas, da mais estreita para a mais larga</b>: quem relata (o
/// codigo pessoal, no projeto que usa esse modo; senao, o IP), o IP, o endereco de
/// origem e o projeto (na hora e no dia). Cada uma tem o seu limite em
/// <see cref="ProjectReportLimits"/>. Passado o limite, o relato so entra com o
/// desafio resolvido (<see cref="ReportChallenge"/>); no dobro, a camada pausa por
/// quinze minutos. Antes de tudo, o intervalo minimo entre dois relatos da mesma
/// pessoa ou do mesmo IP, recusado sem desafio.</para>
///
/// <para><b>Na memoria, e nao no banco, de proposito.</b> A contagem por IP nao pode ir
/// para o banco — o sistema nao guarda IP em tabela nenhuma —, e as outras ficam junto
/// para a regra morar num lugar so. O preco esta escrito: <b>uma instancia so</b> da
/// API (cada instancia contaria a sua parte), e reiniciar zera as contagens e as
/// pausas. Para o tamanho de hoje, as duas coisas sao aceitaveis; com mais de uma
/// instancia, isto vai para um armazenamento compartilhado.</para>
///
/// <para><b>Conta o relato aceito, e nao a tentativa.</b> Quem e recusado nao gastou
/// nada do banco; e quem resolve o desafio a cada relato chega ao dobro e pausa. A
/// conferencia vem antes e a contagem depois da gravacao, sem reserva: dois pedidos
/// no mesmo instante podem passar os dois — um a mais, nunca uma rajada.</para>
/// </summary>
public sealed class ReportLimiter
{
    /// <summary>De quanto em quanto tempo as janelas vazias e as pausas vencidas saem da memoria.</summary>
    private static readonly TimeSpan SweepEvery = TimeSpan.FromMinutes(5);

    private readonly object _lock = new();

    /// <summary>Os relatos aceitos de cada chave, do mais antigo para o mais novo.</summary>
    private readonly Dictionary<string, List<DateTime>> _windows = new(StringComparer.Ordinal);

    /// <summary>As chaves pausadas, com o fim da pausa.</summary>
    private readonly Dictionary<string, DateTime> _pauses = new(StringComparer.Ordinal);

    /// <summary>Os avisos de pausa ja dados, por projeto, camada e endereco, ate quando valem.</summary>
    private readonly Dictionary<string, DateTime> _notified = new(StringComparer.Ordinal);

    /// <summary>Os bilhetes de desafio ja usados, ate vencerem.</summary>
    private readonly Dictionary<string, DateTime> _usedChallenges = new(StringComparer.Ordinal);

    private readonly byte[] _challengeKey;

    private DateTime _lastSweep = DateTime.MinValue;

    public ReportLimiter()
        : this(ReportChallenge.DeriveKey(EnvironmentConstants.GetJwtSigningKey()))
    {
    }

    internal ReportLimiter(byte[] challengeKey)
    {
        _challengeKey = challengeKey;
    }

    /// <summary>Quem esta enviando, e por qual projeto e endereco.</summary>
    /// <param name="ProjectId">O projeto, pelo id interno: so mora na memoria.</param>
    /// <param name="ProjectPublicId">O projeto no bilhete do desafio.</param>
    /// <param name="Ip">O IP de quem pede, como a conexao (ou o proxy listado) diz.</param>
    /// <param name="ReporterCode">O codigo pessoal, quando o projeto usa esse modo e ele veio.</param>
    /// <param name="Origin">O endereco de origem, ja na forma das listas; vazio sem endereco.</param>
    public readonly record struct Sender(long ProjectId, Guid ProjectPublicId, string Ip, string? ReporterCode, string Origin);

    /// <summary>O que fazer com o relato.</summary>
    public abstract record Verdict
    {
        /// <summary>Pode entrar.</summary>
        public sealed record Allowed : Verdict;

        /// <summary>Cedo demais depois do anterior: recusar, sem desafio.</summary>
        public sealed record TooSoon(int RetryAfterSeconds) : Verdict;

        /// <summary>Passou do limite: so com o desafio resolvido.</summary>
        public sealed record Challenge(ReportChallenge.Issued Issued) : Verdict;

        /// <summary>
        /// A camada esta pausada. <paramref name="Notify"/> diz se o time deve ser
        /// avisado agora: so quando a pausa comeca, e uma vez por camada e endereco
        /// enquanto ela durar — cem IPs pausados no mesmo ataque sao um aviso, e nao cem.
        /// </summary>
        public sealed record Paused(ReportLimitScopeEnum Scope, string? Subject, DateTime Until, bool Notify) : Verdict;
    }

    /// <summary>Confere as camadas, na ordem: pausa, intervalo minimo, limites.</summary>
    public Verdict Check(Sender sender, ProjectReportLimits limits, string? challengeToken, string? challengeNonce, DateTime now)
    {
        var camadas = Layers(sender, limits);

        lock (_lock)
        {
            Sweep(now);

            // 1. A pausa vale para a camada inteira, com ou sem desafio.
            foreach (var camada in camadas)
            {
                if (_pauses.TryGetValue(camada.PauseKey, out var ate) && ate > now)
                    return new Verdict.Paused(camada.Scope, camada.Subject, ate, Notify: false);
            }

            // 2. O intervalo minimo, da mesma pessoa ou do mesmo IP. Sem desafio: o
            //    relato legitimo nunca precisa sair dois em trinta segundos, e o
            //    desafio aqui so ensinaria a rajada a esperar a conta.
            if (limits.MinIntervalSeconds > 0)
            {
                var intervalo = TimeSpan.FromSeconds(limits.MinIntervalSeconds);
                foreach (var chave in new[] { ReporterKey(sender), IpKey(sender) })
                {
                    if (_windows.TryGetValue(chave, out var lista) && lista.Count > 0 && now - lista[^1] < intervalo)
                        return new Verdict.TooSoon((int)Math.Ceiling((intervalo - (now - lista[^1])).TotalSeconds));
                }
            }

            // 3. Os limites. O dobro pausa na hora; passar de um pede o desafio.
            var passou = false;
            foreach (var camada in camadas)
            {
                var contagem = Count(camada.WindowKey, now - camada.Window);

                if (contagem >= camada.Limit * ReportLimitsDefaults.PauseFactor)
                {
                    var ate = now + ReportLimitsDefaults.Pause;
                    _pauses[camada.PauseKey] = ate;

                    var aviso = $"{sender.ProjectId}:{camada.Scope}:{camada.Subject}";
                    var avisar = !_notified.TryGetValue(aviso, out var avisadoAte) || avisadoAte <= now;
                    if (avisar)
                        _notified[aviso] = ate;

                    return new Verdict.Paused(camada.Scope, camada.Subject, ate, avisar);
                }

                if (contagem >= camada.Limit)
                    passou = true;
            }

            if (!passou)
                return new Verdict.Allowed();

            var binding = ReportChallenge.Binding(sender.ProjectId, IpKey(sender));
            var resolvido = ReportChallenge.Verify(_challengeKey, challengeToken, challengeNonce, sender.ProjectPublicId, binding, now);

            // Bilhete valido e ainda nao usado: entra, e o bilhete morre aqui.
            if (resolvido is var (id, vence) && _usedChallenges.TryAdd(id, vence))
                return new Verdict.Allowed();

            return new Verdict.Challenge(ReportChallenge.Issue(_challengeKey, sender.ProjectPublicId, binding, now));
        }
    }

    /// <summary>Conta o relato que entrou, em todas as camadas. Depois da gravacao.</summary>
    public void Record(Sender sender, ProjectReportLimits limits, DateTime now)
    {
        lock (_lock)
        {
            foreach (var chave in Layers(sender, limits).Select(camada => camada.WindowKey).Distinct(StringComparer.Ordinal))
            {
                if (!_windows.TryGetValue(chave, out var lista))
                    _windows[chave] = lista = [];

                lista.Add(now);
            }
        }
    }

    /// <summary>
    /// As camadas deste envio. A do projeto aparece duas vezes — hora e dia — sobre a
    /// mesma lista e a mesma pausa: o projeto pausado esta pausado, seja por qual das
    /// duas.
    /// </summary>
    private static IReadOnlyList<Layer> Layers(Sender sender, ProjectReportLimits limits)
    {
        var projeto = $"prj:{sender.ProjectId}";
        var origem = $"org:{sender.ProjectId}:{sender.Origin}";

        return
        [
            new(ReportLimitScopeEnum.Reporter, ReporterKey(sender), ReporterKey(sender), ReportLimitsDefaults.ReporterWindow, limits.PerReporter, null),
            new(ReportLimitScopeEnum.Ip, IpKey(sender), IpKey(sender), ReportLimitsDefaults.HourWindow, limits.PerIpPerHour, null),
            new(ReportLimitScopeEnum.Origin, origem, origem, ReportLimitsDefaults.HourWindow, limits.PerOriginPerHour,
                sender.Origin.Length > 0 ? sender.Origin : null),
            new(ReportLimitScopeEnum.Project, projeto, projeto, ReportLimitsDefaults.HourWindow, limits.PerProjectPerHour, null),
            new(ReportLimitScopeEnum.Project, projeto, projeto, ReportLimitsDefaults.DayWindow, limits.PerProjectPerDay, null),
        ];
    }

    /// <summary>
    /// A pessoa: o codigo pessoal quando ha um, senao o IP. Com o IP, as camadas de
    /// pessoa e de IP leem a mesma lista com janelas e limites diferentes.
    /// </summary>
    private static string ReporterKey(Sender sender)
        => string.IsNullOrEmpty(sender.ReporterCode)
            ? IpKey(sender)
            : $"rep:{sender.ProjectId}:{sender.ReporterCode}";

    private static string IpKey(Sender sender) => $"ip:{sender.ProjectId}:{sender.Ip}";

    /// <summary>Quantos relatos a chave tem desde <paramref name="since"/>.</summary>
    private int Count(string key, DateTime since)
    {
        if (!_windows.TryGetValue(key, out var lista) || lista.Count == 0)
            return 0;

        // A lista esta em ordem: o primeiro dentro da janela, por busca binaria.
        var inicio = lista.BinarySearch(since);
        if (inicio < 0)
            inicio = ~inicio;

        return lista.Count - inicio;
    }

    /// <summary>
    /// Tira da memoria o que nao conta mais: o que passou da maior janela (o dia), as
    /// pausas vencidas e os bilhetes vencidos. De tempos em tempos, e nao a cada
    /// pedido.
    /// </summary>
    private void Sweep(DateTime now)
    {
        if (now - _lastSweep < SweepEvery)
            return;

        _lastSweep = now;
        var corte = now - ReportLimitsDefaults.DayWindow;

        foreach (var (chave, lista) in _windows.ToList())
        {
            var velhos = lista.BinarySearch(corte);
            if (velhos < 0)
                velhos = ~velhos;

            if (velhos > 0)
                lista.RemoveRange(0, velhos);

            if (lista.Count == 0)
                _windows.Remove(chave);
        }

        foreach (var (chave, ate) in _pauses.ToList())
        {
            if (ate <= now)
                _pauses.Remove(chave);
        }

        foreach (var (chave, ate) in _notified.ToList())
        {
            if (ate <= now)
                _notified.Remove(chave);
        }

        foreach (var (id, vence) in _usedChallenges.ToList())
        {
            if (vence <= now)
                _usedChallenges.Remove(id);
        }
    }

    private sealed record Layer(
        ReportLimitScopeEnum Scope,
        string WindowKey,
        string PauseKey,
        TimeSpan Window,
        int Limit,
        string? Subject);
}
