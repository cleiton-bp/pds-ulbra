using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Pds.Data.Context;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.WebApi.Realtime;

/// <summary>
/// Manda os avisos pelo hub. Ver <see cref="IWorkNotifier"/> para o porque de cada
/// regra; aqui fica o como.
///
/// <para><b>O time e lido uma vez por pedido</b>, no primeiro aviso dele. Os donos da
/// conta do projeto e quem tem linha no time, agora — e o aviso vai so para os grupos
/// dessas pessoas. Uma consulta, por indice, depois do <c>commit</c> (mais uma no aviso
/// de card, que antes descobre de qual projeto ele e). O notificador vive o tempo de um
/// pedido, ou de uma mensagem da fila, e dentro dele o time nao muda: quem tira ou poe
/// alguem no time grava antes de avisar. O pedido seguinte le de novo.</para>
///
/// <para><b>O envio sai do caminho do pedido.</b> As leituras do time acontecem no
/// pedido de quem mudou (o banco e o dele), com prazo; o envio vai a parte, tambem com
/// prazo. Uma conexao que para de ler — de proposito ou nao — enche o que o servidor
/// guarda para ela, e o envio esperaria; esperando no pedido, travaria as escritas do
/// projeto inteiro. Passou do prazo, o aviso e registrado como nao enviado.</para>
///
/// <para><b>As leituras desligam o filtro global</b>, como as da montagem do acesso:
/// quem manda pode ser a fila, sem pessoa nenhuma na sessao, e o filtro nao devolveria
/// nada. As condicoes de exclusao sao escritas a mao, e o SQL leva a marca
/// <see cref="QueryTag"/>.</para>
///
/// <para><b>Uma instancia so.</b> Os grupos moram na memoria deste processo. Com duas
/// instancias da API, um aviso so chegaria a quem esta conectado na mesma — ai o hub
/// precisa de um backplane (Redis), ligado no registro do tempo real
/// (<see cref="RealtimeRegistration"/>).</para>
/// </summary>
public sealed class HubWorkNotifier : IWorkNotifier
{
    /// <summary>Marca no SQL do log as leituras do aviso, que desligam o filtro de proposito.</summary>
    public const string QueryTag = "aviso em tempo real";

    /// <summary>
    /// O cabecalho com a conexao da aba que fez o pedido. Volta no aviso, e aquela aba o
    /// ignora: ela ja mostra o que mudou.
    /// </summary>
    public const string OriginHeader = "X-Realtime-Connection";

    /// <summary>O mais que as leituras do aviso seguram o pedido, e o mais que um envio espera.</summary>
    public static readonly TimeSpan Prazo = TimeSpan.FromSeconds(2);

    private readonly IHubContext<WorkHub> _hub;
    private readonly DataContext _dataContext;

    /// <summary>
    /// Os grupos do time de cada projeto avisado neste pedido. Um card que muda com o pai,
    /// ou varios cards de uma vez, liam o mesmo time de novo a cada aviso.
    /// </summary>
    private readonly Dictionary<Guid, IReadOnlyList<string>> _gruposDoTime = [];
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<HubWorkNotifier> _logger;

    public HubWorkNotifier(
        IHubContext<WorkHub> hub,
        DataContext dataContext,
        IHttpContextAccessor httpContextAccessor,
        ILogger<HubWorkNotifier> logger)
    {
        _hub = hub;
        _dataContext = dataContext;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
    }

    public Task CardChangedAsync(Guid reportPublicId)
        => SemDerrubarAsync("card", reportPublicId, async ct =>
        {
            var card = await _dataContext.Reports
                .TagWith(QueryTag)
                .IgnoreQueryFilters()
                .AsNoTracking()
                .Where(report => report.PublicId == reportPublicId && report.DeletedAt == null)
                .Select(report => new
                {
                    Project = report.Project.PublicId,
                    State = report.ProjectState == null ? (Guid?)null : report.ProjectState.PublicId,
                    report.ArchivedAt,
                    // A subtarefa que muda muda o progresso do pai: ele e avisado junto.
                    Pai = report.ParentReport == null || report.ParentReport.DeletedAt != null
                        ? null
                        : new
                        {
                            report.ParentReport.PublicId,
                            State = report.ParentReport.ProjectState == null ? (Guid?)null : report.ParentReport.ProjectState.PublicId,
                            report.ParentReport.ArchivedAt,
                        },
                })
                .FirstOrDefaultAsync(ct);

            if (card is null)
                return;

            var origem = Origem();
            await MandarAoTimeAsync("card", reportPublicId, card.Project, "CardChanged",
                new CardChangedNotice(card.Project, reportPublicId, card.State, card.ArchivedAt != null, origem, card.Pai?.PublicId), ct);

            if (card.Pai is { } pai)
                await MandarAoTimeAsync("card", pai.PublicId, card.Project, "CardChanged",
                    new CardChangedNotice(card.Project, pai.PublicId, pai.State, pai.ArchivedAt != null, origem), ct);
        });

    public Task ProjectChangedAsync(Guid projectPublicId)
        => SemDerrubarAsync("projeto", projectPublicId, ct =>
            MandarAoTimeAsync("projeto", projectPublicId, projectPublicId, "ProjectChanged",
                new ProjectChangedNotice(projectPublicId, Origem()), ct));

    public Task AccessLostAsync(Guid projectPublicId, Guid userPublicId)
    {
        Despachar("acesso", projectPublicId, prazo =>
            _hub.Clients.Group(WorkGroups.Of(projectPublicId, userPublicId))
                .SendAsync("AccessLost", new AccessLostNotice(projectPublicId), prazo));
        return Task.CompletedTask;
    }

    public Task NotificationArrivedAsync(Guid projectPublicId, Guid userPublicId, NotificationKindEnum kind)
    {
        Despachar("aviso", projectPublicId, prazo =>
            _hub.Clients.Group(WorkGroups.Of(projectPublicId, userPublicId))
                .SendAsync("NotificationArrived", new NotificationArrivedNotice(projectPublicId, kind.ToString()), prazo));
        return Task.CompletedTask;
    }

    private async Task MandarAoTimeAsync(string qual, Guid publicId, Guid projectPublicId, string metodo, object aviso, CancellationToken ct)
    {
        var grupos = await GruposDoTimeAsync(projectPublicId, ct);
        if (grupos.Count > 0)
            Despachar(qual, publicId, prazo => _hub.Clients.Groups(grupos).SendAsync(metodo, aviso, prazo));
    }

    /// <summary>
    /// Manda sem o pedido esperar, com o prazo proprio. O hub e de vida longa, e o
    /// envio nao usa nada do pedido — que pode ja ter terminado quando ele acontece.
    /// </summary>
    private void Despachar(string qual, Guid publicId, Func<CancellationToken, Task> enviar)
    {
        _ = Task.Run(async () =>
        {
            using var prazo = new CancellationTokenSource(Prazo);
            try
            {
                await enviar(prazo.Token);
            }
            catch (Exception falha)
            {
                _logger.LogWarning(falha, "Aviso em tempo real ({Qual}) de {PublicId} nao saiu.", qual, publicId);
            }
        });
    }

    /// <summary>
    /// Os grupos de quem esta no time do projeto agora: os donos da conta e o time — numa
    /// consulta so, que parte do projeto, e uma vez por pedido (ver <see cref="_gruposDoTime"/>).
    /// </summary>
    private async Task<IReadOnlyList<string>> GruposDoTimeAsync(Guid projectPublicId, CancellationToken ct)
    {
        if (_gruposDoTime.TryGetValue(projectPublicId, out var lidos))
            return lidos;

        var projeto = _dataContext.Projects
            .IgnoreQueryFilters()
            .Where(project => project.PublicId == projectPublicId
                              && project.DeletedAt == null
                              && project.Account.DeletedAt == null);

        var donos = from project in projeto
                    join user in _dataContext.Users.IgnoreQueryFilters() on project.AccountId equals user.AccountId
                    where user.DeletedAt == null
                    select user.PublicId;

        var time = from project in projeto
                   join member in _dataContext.ProjectMembers.IgnoreQueryFilters() on project.Id equals member.ProjectId
                   where member.DeletedAt == null && member.User.DeletedAt == null
                   select member.User.PublicId;

        var pessoas = await donos.Union(time).TagWith(QueryTag).ToListAsync(ct);

        var grupos = pessoas.Select(pessoa => WorkGroups.Of(projectPublicId, pessoa)).ToList();
        _gruposDoTime[projectPublicId] = grupos;
        return grupos;
    }

    /// <summary>
    /// A conexao da aba que fez o pedido, quando veio do painel. So o formato dos ids do
    /// hub passa — letras, numeros, hifen e sublinhado, e curto —, para o cabecalho nao
    /// virar um jeito de pendurar texto qualquer no aviso dos outros.
    /// </summary>
    private string? Origem()
    {
        var valor = _httpContextAccessor.HttpContext?.Request.Headers[OriginHeader].ToString();

        return !string.IsNullOrEmpty(valor)
               && valor.Length <= 64
               && valor.All(letra => char.IsAsciiLetterOrDigit(letra) || letra is '-' or '_')
            ? valor
            : null;
    }

    private async Task SemDerrubarAsync(string qual, Guid publicId, Func<CancellationToken, Task> mandar)
    {
        // So o prazo cancela: quem pediu ter ido embora nao e motivo para as outras telas
        // ficarem sem saber — a mudanca esta gravada.
        using var prazo = new CancellationTokenSource(Prazo);
        try
        {
            await mandar(prazo.Token);
        }
        catch (Exception falha)
        {
            // A mudanca ja esta gravada; sem o aviso, as outras telas so a veem quando
            // relerem. Registrar e seguir.
            _logger.LogWarning(falha, "Aviso em tempo real ({Qual}) de {PublicId} nao saiu.", qual, publicId);
        }
    }
}
