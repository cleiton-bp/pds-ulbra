using System.Text.Json;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Filters;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Origins;
using Pds.Service.Reports;

namespace Pds.Service.Services;

public class ProjectOriginService : IProjectOriginService
{
    /// <summary>
    /// Teto por projeto. A lista inteira e lida a cada abertura da ferramenta e a
    /// cada relato que declara de onde veio, para comparar o endereco com ela.
    ///
    /// <para>E o teto tambem antecipa o dia em que ela virar um cabecalho
    /// <c>frame-ancestors</c>: cabecalho tem tamanho util limitado, e uma lista
    /// grande demais passaria a ser recusada pelo servidor — a ferramenta pararia
    /// de abrir em todo lugar de uma vez, e nao so no endereco excedente.</para>
    /// </summary>
    private const int MaxOriginsPerProject = 50;

    /// <summary>
    /// Quantos enderecos a tela de Dominios mostra entre os que mandaram relatos. Cem e
    /// mais do que um cliente tem de verdade; o que passa disso e enxurrada, e o que
    /// importa nela e o mais recente — a lista vem do mais novo para o mais antigo.
    /// </summary>
    private const int MaxObservedOrigins = 100;

    private readonly IUnitOfWork _unitOfWork;

    /// <summary>Quem bloqueou, para a linha guardar.</summary>
    private readonly IAccountContext _accountContext;

    /// <summary>
    /// Bloquear e desbloquear acendem e apagam a marca de origem bloqueada em cards que
    /// outras telas estao mostrando: elas releem, como em toda mudanca do projeto.
    /// </summary>
    private readonly IWorkNotifier _notifier;

    /// <summary>
    /// Bloquear apaga de vez os relatos retidos daquele endereco, e os arquivos dos
    /// anexos deles saem do armazenamento depois do banco.
    /// </summary>
    private readonly IMediaStorage _mediaStorage;

    public ProjectOriginService(IUnitOfWork unitOfWork, IAccountContext accountContext, IWorkNotifier notifier, IMediaStorage mediaStorage)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
        _notifier = notifier;
        _mediaStorage = mediaStorage;
    }

    public async Task<IReadOnlyList<ProjectOriginViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var origins = await _unitOfWork.ProjectOrigins.ListByProjectAsync(project.Id, cancellationToken);

        return origins.Select(Map).ToList();
    }

    public async Task<ProjectOriginViewModel> CreateAsync(Guid projectPublicId, CreateProjectOriginDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        // Normaliza antes de qualquer conferencia: e a forma normalizada que o
        // duplicado compara e que o indice unico do banco enxerga.
        var (domain, wildcard) = OriginDomain.Normalize(dto.Domain);

        // Curinga digitado liga a opcao, e nunca a desliga: quem escreveu
        // *.site.com pediu os subdominios, mesmo com a caixa desmarcada.
        var allowsSubdomains = dto.AllowsSubdomains || wildcard;

        if (await _unitOfWork.ProjectOrigins.DomainExistsAsync(project.Id, domain, cancellationToken))
            throw new ConflictException("Este dominio ja esta autorizado neste projeto.");

        var total = await _unitOfWork.ProjectOrigins.CountByProjectAsync(project.Id, cancellationToken);
        if (total >= MaxOriginsPerProject)
            throw new ConflictException($"Um projeto pode autorizar ate {MaxOriginsPerProject} dominios.");

        var origin = new ProjectOrigin
        {
            ProjectId = project.Id,
            Domain = domain,
            AllowsSubdomains = allowsSubdomains,
        };

        // Autorizar o que estava bloqueado e desbloquear: o bloqueio vence a
        // autorizacao, e deixar os dois faria o "Permitir" da tela nao fazer nada.
        var bloqueio = await _unitOfWork.ProjectBlockedOrigins.FindByDomainAsync(project.Id, domain, cancellationToken);

        // Coberto pelo bloqueio de outra linha — o *.loja.com, ao permitir app.loja.com —,
        // permitir nao mudaria nada: o bloqueio vence. Desfazer aquele em silencio
        // abriria todos os outros subdominios, entao a recusa diz qual desbloquear.
        var cobre = (await _unitOfWork.ProjectBlockedOrigins.ListByProjectAsync(project.Id, cancellationToken))
            .FirstOrDefault(item => item.IncludesSubdomains
                                    && !string.Equals(item.Domain, domain, StringComparison.Ordinal)
                                    && OriginDomain.Covers(item.Domain, true, domain));
        if (cobre is not null)
            throw new ConflictException(
                $"O bloqueio de *.{cobre.Domain} cobre este dominio. Desbloqueie *.{cobre.Domain} antes de permitir.");

        if (bloqueio is not null)
            await _unitOfWork.ProjectBlockedOrigins.SoftDeleteAsync(bloqueio, cancellationToken);

        await _unitOfWork.ProjectOrigins.AddAsync(origin, cancellationToken);

        // Os relatos retidos que esta linha passa a cobrir entram no Trabalho na mesma
        // gravacao: autorizar e dizer "este endereco e meu", e o que ele ja mandou e do
        // cliente tambem.
        var liberados = await ReleaseAsync(project, domain, allowsSubdomains, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        if (bloqueio is not null || liberados > 0)
            await _notifier.ProjectChangedAsync(project.PublicId);

        return Map(origin);
    }

    public async Task DeleteAsync(Guid projectPublicId, Guid originPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        var origin = await _unitOfWork.ProjectOrigins.GetByPublicIdAsync(originPublicId, cancellationToken);

        // O filtro global ja garante que o endereco e de um projeto que a pessoa
        // enxerga, mas nao que e deste: sem esta conferencia, um endereco de outro
        // projeto dela seria aceito pela rota errada — e quem e administrador aqui
        // e so membro la mudaria a configuracao de la. Nao e redundante.
        if (origin is null || origin.ProjectId != project.Id)
            throw new KeyNotFoundException("Dominio nao encontrado neste projeto.");

        await _unitOfWork.ProjectOrigins.SoftDeleteAsync(origin, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ObservedOriginViewModel>> ListObservedAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var origens = await TallyAsync(project.Id, cancellationToken);
        var autorizados = await _unitOfWork.ProjectOrigins.ListByProjectAsync(project.Id, cancellationToken);
        var bloqueados = await _unitOfWork.ProjectBlockedOrigins.ListByProjectAsync(project.Id, cancellationToken);

        return origens
            .OrderByDescending(origem => origem.LastAt)
            .ThenBy(origem => origem.Origin, StringComparer.Ordinal)
            .Take(MaxObservedOrigins)
            .Select(origem =>
            {
                // O bloqueio primeiro, como na porta: o endereco nas duas listas e
                // recusado, e a tela precisa dizer o que de fato acontece com ele.
                var bloqueio = bloqueados.FirstOrDefault(item => OriginDomain.Covers(item.Domain, item.IncludesSubdomains, origem.Origin));
                var status = bloqueio is not null
                    ? ObservedOriginStatusEnum.Blocked
                    : autorizados.Any(item => OriginDomain.Covers(item.Domain, item.AllowsSubdomains, origem.Origin))
                        ? ObservedOriginStatusEnum.Allowed
                        : ObservedOriginStatusEnum.Unlisted;

                return new ObservedOriginViewModel(
                    origem.Origin,
                    origem.Total,
                    origem.LastAt,
                    status,
                    bloqueio is null ? 0 : origem.NotKept,
                    bloqueio?.PublicId);
            })
            .ToList();
    }

    public async Task<IReadOnlyList<ProjectBlockedOriginViewModel>> ListBlockedAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var bloqueados = await _unitOfWork.ProjectBlockedOrigins.ListByProjectAsync(project.Id, cancellationToken);
        IReadOnlyList<ReportOriginTally> origens = bloqueados.Count == 0 ? [] : await TallyAsync(project.Id, cancellationToken);

        return bloqueados.Select(item => MapBlocked(item, origens)).ToList();
    }

    public async Task<ProjectBlockedOriginViewModel> BlockAsync(Guid projectPublicId, CreateProjectBlockedOriginDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        // A mesma forma da lista de autorizados: e ela que as duas comparam com o
        // endereco do relato, e a que o indice unico enxerga.
        var (domain, wildcard) = OriginDomain.Normalize(dto.Domain);

        if (await _unitOfWork.ProjectBlockedOrigins.FindByDomainAsync(project.Id, domain, cancellationToken) is not null)
            throw new ConflictException("Este dominio ja esta bloqueado neste projeto.");

        var total = await _unitOfWork.ProjectBlockedOrigins.CountByProjectAsync(project.Id, cancellationToken);
        if (total >= ProjectBlockedOrigin.MaxPerProject)
            throw new ConflictException($"Um projeto pode bloquear ate {ProjectBlockedOrigin.MaxPerProject} dominios. Para fechar a porta de vez, use a lista de autorizados.");

        // Bloquear o que estava autorizado tira da lista de autorizados: as duas
        // listas nunca dizem o contrario uma da outra sobre o mesmo endereco. E a
        // ultima linha saindo volta a lista a "aberta" — mas o bloqueio continua
        // barrando este endereco, que e o que se pediu.
        var autorizado = await _unitOfWork.ProjectOrigins.FindByDomainAsync(project.Id, domain, cancellationToken);
        if (autorizado is not null)
            await _unitOfWork.ProjectOrigins.SoftDeleteAsync(autorizado, cancellationToken);

        var bloqueio = new ProjectBlockedOrigin
        {
            ProjectId = project.Id,
            Domain = domain,
            // Curinga digitado liga a opcao, como na lista de autorizados.
            IncludesSubdomains = dto.IncludesSubdomains || wildcard,
            BlockedByUserId = _accountContext.UserId,
        };

        // Os relatos retidos deste endereco saem de vez, na mesma transacao do bloqueio:
        // nunca foram aceitos, e bloquear e dizer "nao e meu". Os ja aceitos ficam, com a
        // marca de origem bloqueada, para o time decidir em lote.
        var arquivos = await _unitOfWork.InTransactionAsync(async ct =>
        {
            await _unitOfWork.ProjectBlockedOrigins.AddAsync(bloqueio, ct);
            await _unitOfWork.CommitAsync(ct);

            var apagados = await PurgeHeldAsync(project, domain, bloqueio.IncludesSubdomains, ct);
            await _unitOfWork.CommitAsync(ct);
            return apagados;
        }, cancellationToken);

        await StoredFiles.DeleteUnusedAsync(_unitOfWork, _mediaStorage, arquivos);

        // Os cards que ja vieram de la passam a estar marcados: as telas releem.
        await _notifier.ProjectChangedAsync(project.PublicId);

        var origens = await TallyAsync(project.Id, cancellationToken);
        var quem = _accountContext.UserId is long userId
            ? await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken)
            : null;
        bloqueio.BlockedByUser = quem;

        return MapBlocked(bloqueio, origens);
    }

    public async Task UnblockAsync(Guid projectPublicId, Guid blockedPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        var bloqueio = await _unitOfWork.ProjectBlockedOrigins.GetByPublicIdAsync(blockedPublicId, cancellationToken);

        // A mesma conferencia de remover um autorizado: o filtro global garante que e
        // de um projeto que a pessoa enxerga, e nao que e deste.
        if (bloqueio is null || bloqueio.ProjectId != project.Id)
            throw new KeyNotFoundException("Dominio bloqueado nao encontrado neste projeto.");

        await _unitOfWork.ProjectBlockedOrigins.SoftDeleteAsync(bloqueio, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.ProjectChangedAsync(project.PublicId);
    }

    public async Task<IReadOnlyList<HeldOriginViewModel>> ListPendingAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var retidos = await _unitOfWork.Reports.TallyHeldOriginsAsync(project.Id, cancellationToken);

        // Do mais recente para o mais antigo, como os que mandaram relatos: o que acabou
        // de chegar e o que o sino acabou de avisar.
        return retidos
            .OrderByDescending(item => item.LastAt)
            .ThenBy(item => item.Origin, StringComparer.Ordinal)
            .Select(item => new HeldOriginViewModel(item.Origin, item.Total, item.LastAt))
            .ToList();
    }

    public async Task<HeldOriginReportsResultViewModel> ReleasePendingAsync(Guid projectPublicId, HeldOriginReportsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var endereco = PendingDomain(dto.Domain);

        var liberados = await ReleaseAsync(project, endereco, false, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        if (liberados > 0)
            await _notifier.ProjectChangedAsync(project.PublicId);

        return new HeldOriginReportsResultViewModel(liberados);
    }

    public async Task<HeldOriginReportsResultViewModel> DeletePendingAsync(Guid projectPublicId, HeldOriginReportsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var endereco = PendingDomain(dto.Domain);

        var total = 0;
        var arquivos = await _unitOfWork.InTransactionAsync(async ct =>
        {
            var retidos = await _unitOfWork.Reports.ListHeldAsync(project.Id, endereco, false, ct);
            total = retidos.Count;

            var apagados = await PurgeAsync(project, retidos, ct);
            await _unitOfWork.CommitAsync(ct);
            return apagados;
        }, cancellationToken);

        await StoredFiles.DeleteUnusedAsync(_unitOfWork, _mediaStorage, arquivos);

        return new HeldOriginReportsResultViewModel(total);
    }

    /// <summary>
    /// O endereco de "Aguardando liberacao", na forma em que o relato o guarda; nulo e
    /// vazio sao os relatos que nao disseram de onde vieram.
    /// </summary>
    private static string? PendingDomain(string? domain)
    {
        var endereco = OriginDomain.ForComparison(domain);
        return endereco.Length == 0 ? null : endereco;
    }

    /// <summary>
    /// Tira da retencao os relatos deste endereco e os poe no topo do quadro, do mais
    /// antigo para o mais novo — o mais novo fica em cima, como se tivesse acabado de
    /// chegar. Grava junto com quem chamou. Devolve quantos.
    /// </summary>
    private async Task<int> ReleaseAsync(Project project, string? domain, bool includesSubdomains, CancellationToken cancellationToken)
    {
        var retidos = await _unitOfWork.Reports.ListHeldAsync(project.Id, domain, includesSubdomains, cancellationToken);

        foreach (var relato in retidos)
        {
            relato.HeldForOriginAt = null;
            relato.BoardRank = await _unitOfWork.Projects.NextTopRankAsync(project.Id, cancellationToken);
        }

        return retidos.Count;
    }

    /// <summary>
    /// Apaga de vez os relatos retidos que este bloqueio cobre. Dentro da transacao de
    /// quem chama; devolve os arquivos a apagar depois do banco.
    /// </summary>
    private async Task<IReadOnlyList<string>> PurgeHeldAsync(Project project, string domain, bool includesSubdomains, CancellationToken cancellationToken)
        => await PurgeAsync(project, await _unitOfWork.Reports.ListHeldAsync(project.Id, domain, includesSubdomains, cancellationToken), cancellationToken);

    /// <summary>
    /// A exclusao de verdade dos retidos, com o evento de quantos e de onde — o mesmo da
    /// exclusao em lote dos cards de endereco bloqueado, marcado como retido.
    /// </summary>
    private async Task<IReadOnlyList<string>> PurgeAsync(Project project, IReadOnlyList<Report> retidos, CancellationToken cancellationToken)
    {
        if (retidos.Count == 0)
            return [];

        var resultado = await _unitOfWork.Reports.PurgeAsync(project.Id, retidos.Select(relato => relato.Id).ToList(), cancellationToken);

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            UserId = _accountContext.UserId,
            Type = EventTypeEnum.ReportsDeletedFromBlockedOrigin,
            Source = EventSourceEnum.Panel,
            Payload = JsonSerializer.Serialize(new
            {
                reports = retidos.Count,
                subtasks = resultado.Reports - retidos.Count,
                origins = retidos
                    .Select(relato => OriginDomain.ForComparison(relato.Origin))
                    .Distinct(StringComparer.Ordinal)
                    .Order(StringComparer.Ordinal)
                    .ToList(),
                // Retidos: chegaram de um endereco fora da lista, e o time nunca os viu.
                held = true,
            }),
        }, cancellationToken);

        return resultado.ObjectKeys;
    }

    /// <summary>
    /// Os relatos contados por endereco, ja na forma das listas. O banco agrupa pelo
    /// endereco em minusculo; aqui ele passa pela mesma limpeza do que a pagina
    /// declara, e o que sobrar igual vira uma linha so — relato antigo, gravado com o
    /// esquema na frente, conta junto com o novo.
    /// </summary>
    private async Task<IReadOnlyList<ReportOriginTally>> TallyAsync(long projectId, CancellationToken cancellationToken)
        => (await _unitOfWork.Reports.TallyOriginsAsync(projectId, cancellationToken))
            .Select(origem => origem with { Origin = OriginDomain.ForComparison(origem.Origin) })
            .Where(origem => origem.Origin.Length > 0)
            .GroupBy(origem => origem.Origin, StringComparer.Ordinal)
            .Select(grupo => new ReportOriginTally(
                grupo.Key,
                grupo.Sum(origem => origem.Total),
                grupo.Sum(origem => origem.NotKept),
                grupo.Max(origem => origem.LastAt)))
            .ToList();

    /// <summary>A linha de bloqueio, com os marcados dela: os relatos que ela cobre e que ninguem manteve.</summary>
    private static ProjectBlockedOriginViewModel MapBlocked(ProjectBlockedOrigin bloqueio, IReadOnlyList<ReportOriginTally> origens) => new(
        bloqueio.PublicId,
        bloqueio.Domain,
        bloqueio.IncludesSubdomains,
        bloqueio.CreatedAt,
        bloqueio.BlockedByUser?.Name,
        origens
            .Where(origem => OriginDomain.Covers(bloqueio.Domain, bloqueio.IncludesSubdomains, origem.Origin))
            .Sum(origem => origem.NotKept));

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    private static ProjectOriginViewModel Map(ProjectOrigin origin) => new(
        origin.PublicId,
        origin.Domain,
        origin.AllowsSubdomains,
        origin.CreatedAt);
}
