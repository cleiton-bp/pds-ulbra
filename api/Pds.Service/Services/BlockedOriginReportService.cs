using System.Text.Json;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Origins;
using Pds.Service.Reports;

namespace Pds.Service.Services;

/// <summary>
/// O que o time decide sobre os relatos que ja tinham chegado de um endereco quando
/// ele foi bloqueado.
///
/// <para><b>Nada acontece sozinho.</b> Bloquear so marca: o endereco pode ter sido
/// bloqueado por engano, e apagar na hora tiraria do ar relatos de verdade. A decisao
/// e do time, em lote, e sao duas — manter (a marca sai) ou apagar de vez.</para>
///
/// <para><b>Apagar de vez e exclusao real, e nao linha marcada.</b> Sai o card e tudo
/// que identifica quem relatou: o texto, as respostas, o titulo, o nome, o contexto,
/// os comentarios, os anexos (a linha e o arquivo guardado), e junto as subtarefas
/// e os vinculos. Fica o evento — sem o card e sem o caminho da pagina —, para a
/// contagem da pesquisa sobreviver sem dado de ninguem.</para>
/// </summary>
public class BlockedOriginReportService : IBlockedOriginReportService
{
    /// <summary>
    /// Teto de cards escolhidos num lote. A selecao da lista chega por aqui inteira, e
    /// quinhentos e mais do que a lista mostra de uma vez; para todos os de um
    /// endereco, o lote vai pelo bloqueio, sem lista.
    /// </summary>
    private const int MaxReportIds = 500;

    /// <summary>A palavra que confirma o apagar de vez, alem do proprio endereco.</summary>
    private const string ConfirmationWord = "apagar";

    private readonly IUnitOfWork _unitOfWork;
    private readonly IAccountContext _accountContext;

    /// <summary>Onde moram os arquivos dos anexos: apagar o card apaga o arquivo tambem.</summary>
    private readonly IMediaStorage _mediaStorage;

    private readonly IWorkNotifier _notifier;

    public BlockedOriginReportService(IUnitOfWork unitOfWork, IAccountContext accountContext, IMediaStorage mediaStorage, IWorkNotifier notifier)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
        _mediaStorage = mediaStorage;
        _notifier = notifier;
    }

    public async Task<BlockedOriginReportsResultViewModel> KeepAsync(Guid projectPublicId, BlockedOriginReportsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var (cards, pedidos) = await SelectAsync(project, dto, cancellationToken);

        if (cards.Count == 0)
            return new BlockedOriginReportsResultViewModel(0, pedidos, 0);

        // Manter vale para sempre, mesmo que o endereco seja desbloqueado e bloqueado
        // de novo: o time ja olhou este card e decidiu que ele fica.
        var agora = DateTime.UtcNow;
        foreach (var card in cards)
            card.BlockedOriginKeptAt = agora;

        await _unitOfWork.CommitAsync(cancellationToken);
        await _notifier.ProjectChangedAsync(project.PublicId);

        return new BlockedOriginReportsResultViewModel(cards.Count, pedidos - cards.Count, 0);
    }

    public async Task<BlockedOriginReportsResultViewModel> DeleteAsync(Guid projectPublicId, DeleteBlockedOriginReportsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var (cards, pedidos) = await SelectAsync(project, dto, cancellationToken);

        if (cards.Count == 0)
            return new BlockedOriginReportsResultViewModel(0, pedidos, 0);

        var enderecos = cards
            .Select(card => OriginDomain.ForComparison(card.Origin))
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToList();

        EnsureConfirmed(dto.Confirmation, enderecos);

        var ids = cards.Select(card => card.Id).ToList();

        // Numa transacao so: sao varios comandos, e pela metade sobraria um card sem
        // metade do que era dele — ou um aviso apontando para um card que nao existe.
        var apagado = await _unitOfWork.InTransactionAsync(async ct =>
        {
            var resultado = await _unitOfWork.Reports.PurgeAsync(project.Id, ids, ct);

            // Um evento do projeto, e nao um por card: o card nao existe mais para o
            // evento apontar. So numeros e enderecos — nada de quem relatou.
            await _unitOfWork.Events.AddAsync(new Event
            {
                AccountId = project.AccountId,
                ProjectId = project.Id,
                UserId = _accountContext.UserId,
                Type = EventTypeEnum.ReportsDeletedFromBlockedOrigin,
                Source = EventSourceEnum.Panel,
                Payload = JsonSerializer.Serialize(new
                {
                    reports = cards.Count,
                    subtasks = resultado.Reports - cards.Count,
                    origins = enderecos,
                }),
            }, ct);

            await _unitOfWork.CommitAsync(ct);
            return resultado;
        }, cancellationToken);

        // Depois do banco, e sem derrubar a resposta: a linha ja saiu, e o pior caso
        // e um arquivo sobrando no balde sem nada apontando para ele.
        await DeleteObjectsAsync(apagado.ObjectKeys);

        await _notifier.ProjectChangedAsync(project.PublicId);

        return new BlockedOriginReportsResultViewModel(cards.Count, pedidos - cards.Count, apagado.Reports - cards.Count);
    }

    /// <summary>
    /// Os cards marcados que o lote alcanca, e quantos foram pedidos. O nao marcado
    /// fica de fora em silencio — a resposta conta quantos —, e nunca e apagado por
    /// estar na selecao.
    /// </summary>
    private async Task<(List<Report> Cards, int Pedidos)> SelectAsync(Project project, BlockedOriginReportsDto dto, CancellationToken cancellationToken)
    {
        var porLista = dto.ReportIds is { Count: > 0 };
        var porBloqueio = dto.BlockedOriginId is not null;

        if (porLista == porBloqueio)
            throw new ArgumentException("Informe os cards (ReportIds) ou o dominio bloqueado (BlockedOriginId), e so um dos dois.");

        if (porLista)
        {
            var pedidos = dto.ReportIds!.Distinct().ToList();
            if (pedidos.Count > MaxReportIds)
                throw new ArgumentException($"Um lote alcanca ate {MaxReportIds} cards.");

            var marcados = await _unitOfWork.Reports.ListBlockedOriginMarkedAsync(project.Id, pedidos, null, cancellationToken);
            return (marcados, pedidos.Count);
        }

        var bloqueio = await _unitOfWork.ProjectBlockedOrigins.GetByPublicIdAsync(dto.BlockedOriginId!.Value, cancellationToken);

        // O filtro global garante que o bloqueio e de um projeto que a pessoa enxerga,
        // e nao que e deste.
        if (bloqueio is null || bloqueio.ProjectId != project.Id)
            throw new KeyNotFoundException("Dominio bloqueado nao encontrado neste projeto.");

        var todos = await _unitOfWork.Reports.ListBlockedOriginMarkedAsync(project.Id, null, bloqueio.Id, cancellationToken);
        return (todos, todos.Count);
    }

    /// <summary>
    /// A confirmacao escrita: a palavra, ou o endereco de onde <b>todos</b> os cards
    /// vieram. A tela pede o mesmo; conferir aqui tambem e o que impede um clique — ou
    /// uma chamada direta — de apagar sem ninguem ter lido o que ia sumir.
    /// </summary>
    private static void EnsureConfirmed(string? confirmation, IReadOnlyList<string> enderecos)
    {
        var escrito = (confirmation ?? string.Empty).Trim().ToLowerInvariant();

        if (escrito == ConfirmationWord)
            return;

        if (enderecos.Count == 1 && escrito.Length > 0 && OriginDomain.ForComparison(escrito) == enderecos[0])
            return;

        throw new ArgumentException("Para apagar de vez, escreva apagar ou o endereco de onde os cards vieram. Nao ha como desfazer.");
    }

    /// <summary>Os arquivos dos anexos, depois do banco: ver <see cref="StoredFiles"/>.</summary>
    private Task DeleteObjectsAsync(IReadOnlyList<string> objectKeys)
        => StoredFiles.DeleteUnusedAsync(_unitOfWork, _mediaStorage, objectKeys);

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
