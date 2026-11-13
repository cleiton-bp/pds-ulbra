using Microsoft.Extensions.Logging;
using Pds.Domain.Entities;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Reports;

namespace Pds.Service.Services;

/// <summary>
/// A exclusao da conta pela propria pessoa, com 24 horas para desistir.
///
/// <para><b>O pedido tira tudo do ar na hora.</b> A conta e os projetos ganham o mesmo
/// <c>DeletedAt</c>, e isso basta para o resto do sistema: a leitura do acesso ja recusa
/// conta apagada (o dono e o time perdem o painel), a chave publica ja recusa projeto
/// apagado (o botao some dos sites) e o acompanhamento passa a recusar relato de projeto
/// fora do ar. As sessoes da pessoa sao encerradas no mesmo movimento.</para>
///
/// <para><b>Desfazer e entrar de novo.</b> O login, dentro do prazo, devolve os projetos
/// que o pedido tirou do ar, reconhecidos pelo mesmo instante, e limpa o pedido. A
/// mensagem da fila continua agendada e, quando chega, rele a conta e nao faz nada.</para>
///
/// <para><b>No fim do prazo, exclusao de verdade.</b> Projetos, relatos, anexos e
/// arquivos saem do banco e do armazenamento; da pessoa sai o que a identifica. Ficam os
/// eventos, sem o caminho da pagina, que sao a contagem anonima da pesquisa.</para>
/// </summary>
public class AccountDeletionService : IAccountDeletionService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAccountContext _accountContext;
    private readonly IDelayedScheduler _scheduler;
    private readonly IMediaStorage _mediaStorage;
    private readonly IWorkNotifier _notifier;
    private readonly ILogger<AccountDeletionService> _logger;

    public AccountDeletionService(
        IUnitOfWork unitOfWork,
        IAccountContext accountContext,
        IDelayedScheduler scheduler,
        IMediaStorage mediaStorage,
        IWorkNotifier notifier,
        ILogger<AccountDeletionService> logger)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
        _scheduler = scheduler;
        _mediaStorage = mediaStorage;
        _notifier = notifier;
        _logger = logger;
    }

    public async Task<AccountDeletionPreviewViewModel> GetPreviewAsync(CancellationToken cancellationToken = default)
    {
        var (accountId, userId) = Session();
        var contagem = await _unitOfWork.Accounts.CountForDeletionAsync(accountId, userId, cancellationToken);

        return new AccountDeletionPreviewViewModel(
            contagem.Projects,
            contagem.Reports,
            contagem.TeamMembers,
            contagem.OtherProjects,
            AccountDeletionDefaults.GraceHours);
    }

    public async Task<AccountDeletionRequestedViewModel> RequestAsync(CancellationToken cancellationToken = default)
    {
        var (accountId, userId) = Session();

        var conta = await _unitOfWork.Accounts.FindWithoutSessionAsync(accountId, cancellationToken)
                    ?? throw new UnauthorizedAccessException("Sessao nao identificada.");

        if (conta.DeletedAt is not null)
            throw new ConflictException("A exclusao desta conta ja foi pedida.");

        var pessoa = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken)
                     ?? throw new UnauthorizedAccessException("Sessao nao identificada.");

        // Quem perde o acesso, lido antes de os projetos sairem do ar: depois, o filtro ja
        // nao os enxerga.
        var times = await _unitOfWork.Accounts.ListTeamsToNotifyAsync(accountId, cancellationToken);

        // Em microssegundos, que e o que o banco guarda: e o mesmo valor que vai na conta e
        // nos projetos, e e por ele que o cancelamento reconhece os projetos que voltam.
        var agora = Microssegundos(DateTime.UtcNow);
        var prazo = agora.AddHours(AccountDeletionDefaults.GraceHours);

        await _unitOfWork.InTransactionAsync(async ct =>
        {
            conta.DeletedAt = agora;
            conta.PurgeAt = prazo;
            _unitOfWork.Accounts.Update(conta);

            // Todas as sessoes da pessoa, em todos os aparelhos: o pedido e o fim do acesso.
            pessoa.SessionsRevokedAt = agora;
            _unitOfWork.Users.Update(pessoa);

            await _unitOfWork.Accounts.TakeProjectsOfflineAsync(accountId, agora, ct);
            await _unitOfWork.CommitAsync(ct);
            return true;
        }, cancellationToken);

        await AgendarLimpezaAsync(conta.PublicId, prazo - DateTime.UtcNow, cancellationToken);

        // A tela de quem estava no projeto fecha agora, como quando alguem sai do time. A da
        // propria pessoa tambem, nas outras abas: a sessao delas ja nao vale.
        foreach (var time in times)
        {
            foreach (var membro in time.MemberPublicIds)
                await _notifier.AccessLostAsync(time.ProjectPublicId, membro);

            if (_accountContext.UserPublicId is Guid eu)
                await _notifier.AccessLostAsync(time.ProjectPublicId, eu);
        }

        _logger.LogInformation("Exclusao pedida para a conta {Account}, definitiva em {PurgeAt:o}.", conta.PublicId, prazo);

        return new AccountDeletionRequestedViewModel(prazo);
    }

    public async Task<AccountDeletionOnSignIn> ResolveOnSignInAsync(long accountId, CancellationToken cancellationToken = default)
    {
        var conta = await _unitOfWork.Accounts.FindWithoutSessionAsync(accountId, cancellationToken);

        if (conta?.DeletedAt is not DateTime pedidoEm || conta.AnonymizedAt is not null)
            return AccountDeletionOnSignIn.None;

        if (conta.PurgeAt is DateTime prazo && prazo > DateTime.UtcNow)
        {
            await _unitOfWork.InTransactionAsync(async ct =>
            {
                await _unitOfWork.Accounts.BringProjectsBackAsync(accountId, pedidoEm, ct);

                conta.DeletedAt = null;
                conta.PurgeAt = null;
                _unitOfWork.Accounts.Update(conta);
                await _unitOfWork.CommitAsync(ct);
                return true;
            }, cancellationToken);

            _logger.LogInformation("Exclusao da conta {Account} cancelada pelo login.", conta.PublicId);
            return AccountDeletionOnSignIn.Cancelled;
        }

        // O prazo venceu e a limpeza ainda nao rodou (a fila atrasou, ou a aplicacao estava
        // fora): faz agora, antes de abrir a sessao. A pessoa entra como quem chega pela
        // primeira vez, com uma conta nova e vazia.
        await PurgeAsync(conta.PublicId, cancellationToken);
        return AccountDeletionOnSignIn.Purged;
    }

    public async Task PurgeAsync(Guid accountPublicId, CancellationToken cancellationToken = default)
    {
        var conta = await _unitOfWork.Accounts.FindByPublicIdWithoutSessionAsync(accountPublicId, cancellationToken);

        // Cancelada, ja limpa ou inexistente: nada a fazer. E o que torna a mensagem
        // repetida, ou a que chega depois do cancelamento, inofensiva.
        if (conta?.DeletedAt is null || conta.AnonymizedAt is not null || conta.PurgeAt is not DateTime prazo)
            return;

        // Chegou antes do prazo (o transporte entrega no teto dele, ou alguem mexeu no
        // relogio): remarca o que falta, em vez de apagar antes do prometido.
        if (prazo > DateTime.UtcNow)
        {
            await AgendarLimpezaAsync(conta.PublicId, prazo - DateTime.UtcNow, cancellationToken);
            return;
        }

        var agora = Microssegundos(DateTime.UtcNow);

        var arquivos = await _unitOfWork.InTransactionAsync(async ct =>
        {
            var chaves = new List<string>();

            foreach (var projeto in await _unitOfWork.Accounts.ListProjectIdsWithoutSessionAsync(conta.Id, ct))
            {
                var relatos = await _unitOfWork.Accounts.ListReportIdsWithoutSessionAsync(projeto, ct);
                if (relatos.Count == 0)
                    continue;

                var apagado = await _unitOfWork.Reports.PurgeAsync(projeto, relatos, ct);
                chaves.AddRange(apagado.ObjectKeys);
            }

            await _unitOfWork.Accounts.DeleteProjectsAsync(
                await _unitOfWork.Accounts.ListProjectIdsWithoutSessionAsync(conta.Id, ct), ct);
            await _unitOfWork.Accounts.AnonymizeAsync(conta.Id, agora, ct);

            return chaves;
        }, cancellationToken);

        // Depois do banco: o armazenamento nao entra na transacao, e o pior caso e um
        // arquivo sobrando no balde sem nada apontando para ele.
        await StoredFiles.DeleteUnusedAsync(_unitOfWork, _mediaStorage, arquivos);

        _logger.LogInformation(
            "Conta {Account} excluida de vez: {Arquivos} arquivo(s) de anexo removido(s).", conta.PublicId, arquivos.Count);
    }

    public Task<IReadOnlyList<Guid>> ListOverdueAsync(CancellationToken cancellationToken = default)
        => _unitOfWork.Accounts.ListOverduePurgesWithoutSessionAsync(DateTime.UtcNow, cancellationToken);

    /// <summary>
    /// Agenda a limpeza, sem derrubar quem chamou: o prazo ja esta gravado, e sem a
    /// mensagem a limpeza acontece na proxima subida ou no proximo login da pessoa.
    /// </summary>
    private async Task AgendarLimpezaAsync(Guid accountPublicId, TimeSpan atraso, CancellationToken cancellationToken)
    {
        if (!_scheduler.IsAvailable)
            return;

        try
        {
            await _scheduler.ScheduleAccountPurgeAsync(accountPublicId, atraso, cancellationToken);
        }
        catch (Exception excecao)
        {
            _logger.LogWarning(excecao, "Nao deu para agendar a limpeza da conta {Account}; fica para a proxima subida.", accountPublicId);
        }
    }

    private (long AccountId, long UserId) Session()
        => (_accountContext.AccountId ?? throw new UnauthorizedAccessException("Sessao nao identificada."),
            _accountContext.UserId ?? throw new UnauthorizedAccessException("Sessao nao identificada."));

    private static DateTime Microssegundos(DateTime instante)
        => new(instante.Ticks - instante.Ticks % 10, DateTimeKind.Utc);
}
