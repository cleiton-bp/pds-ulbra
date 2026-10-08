using System.Net.Mail;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Pds.Domain.Constants;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Email;
using Pds.Service.Security;

namespace Pds.Service.Services;

/// <summary>
/// O convite para o time.
///
/// <para><b>O link nasce no consumidor da fila, e nao aqui.</b> Convidar grava o
/// convite e poe na fila; quem consome sorteia o link, grava o hash, monta o e-mail
/// e manda. O link nunca aparece em tela, nunca viaja pela fila e nunca fica
/// guardado — e reenviar sorteia outro, que invalida o anterior.</para>
///
/// <para><b>Aceitar exige o Google do mesmo endereco, confirmado.</b> O link e a
/// credencial do convite, mas nao basta: encaminhado para outra pessoa, ele nao
/// serve para ela. E quem abre com a conta errada ve so uma pista do endereco, e
/// nada do projeto.</para>
///
/// <para><b>A falha do envio nao volta para quem clicou como erro.</b> O convite ja
/// foi gravado; o e-mail e que nao saiu. O motivo vai para o log, o convite fica
/// marcado, e a tela de Membros oferece reenviar. Sem nova tentativa automatica.</para>
/// </summary>
public class ProjectInvitationService : IProjectInvitationService
{
    /// <summary>O registro do envio que ficou preso no meio de uma queda.</summary>
    public const string InterruptedError = "interrupted";

    /// <summary>
    /// A resposta de todo link que nao vale: inexistente, cancelado, trocado por um
    /// reenvio, ou ja usado por quem saiu do time. A mesma para todos — dizer qual
    /// contaria algo a quem so tem o link.
    /// </summary>
    private const string GoneMessage = "Este convite nao vale mais. Peca um novo a quem convidou.";

    /// <summary>O registro do envio quando a fila recusou a publicacao.</summary>
    public const string QueueError = "queue_unavailable";

    /// <summary>Quanto tempo um envio pode ficar "enviando" antes de a subida considerar que caiu.</summary>
    private static readonly TimeSpan StuckSendingAfter = TimeSpan.FromMinutes(10);

    private readonly IUnitOfWork _unitOfWork;
    private readonly IAccountContext _accountContext;
    private readonly IEmailSender _emailSender;
    private readonly IEmailQueue _emailQueue;
    private readonly ILogger<ProjectInvitationService> _logger;

    /// <summary>
    /// Quem aceita entra na escolha de responsavel do card aberto dos outros. Ver
    /// <see cref="IWorkNotifier"/>.
    /// </summary>
    private readonly IWorkNotifier _notifier;

    public ProjectInvitationService(
        IUnitOfWork unitOfWork,
        IAccountContext accountContext,
        IEmailSender emailSender,
        IEmailQueue emailQueue,
        ILogger<ProjectInvitationService> logger,
        IWorkNotifier notifier)
    {
        _notifier = notifier;
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
        _emailSender = emailSender;
        _emailQueue = emailQueue;
        _logger = logger;
    }

    // ─── Administrador, dentro do projeto ─────────────────────────────────────

    public async Task<ProjectInvitationsViewModel> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var convites = await _unitOfWork.ProjectInvitations.ListOpenByProjectAsync(project.Id, cancellationToken);
        var settings = await _unitOfWork.ProjectTeamSettings.GetByProjectAsync(project.Id, cancellationToken);
        var agora = DateTime.UtcNow;
        var motivo = UnavailableReason();

        return new ProjectInvitationsViewModel(
            convites.Select(convite => Map(convite, agora)).ToList(),
            CanInvite: motivo is null,
            UnavailableReason: motivo,
            ValidityDays: settings?.InvitationValidityDays ?? TeamSettingsDefaults.InvitationValidityDays,
            MaxPerHour: EnvironmentConstants.GetInvitationEmailsPerHour());
    }

    public async Task<ProjectInvitationViewModel> CreateAsync(Guid projectPublicId, CreateInvitationDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var papel = dto.Role ?? throw new ArgumentException("Informe o papel.");

        // O numero que nao e de papel nenhum passa pela leitura do JSON — e pararia
        // na trava do banco, como erro nao previsto.
        if (!Enum.IsDefined(papel))
            throw new ArgumentException("Informe um papel valido: administrador ou membro.");

        var email = NormalizeEmail(dto.Email);

        EnsureCanSend();

        // O dono manda em todos os projetos da conta; convida-lo seria um link que,
        // aceito, nao muda nada — e que diria a ele que entrou num time em que ja
        // manda.
        var donos = await _unitOfWork.Users.ListByAccountAsync(project.AccountId, cancellationToken);
        if (donos.Any(dono => Normalize(dono.Email) == email))
            throw new ConflictException("Essa pessoa e dona do projeto.");

        if (await _unitOfWork.ProjectMembers.ExistsByEmailAsync(project.Id, email, cancellationToken))
            throw new ConflictException("Essa pessoa ja esta no time.");

        await EnsureWithinHourlyLimitAsync(project, cancellationToken);

        var dias = await ValidityDaysAsync(project, cancellationToken);
        var convite = await _unitOfWork.ProjectInvitations.FindOpenByEmailAsync(project.Id, email, cancellationToken);
        var tipo = EventTypeEnum.ProjectInvitationResent;

        if (convite is null)
        {
            // O identificador sai daqui, e nao da gravacao: o evento ja precisa
            // dizer qual convite foi.
            convite = new ProjectInvitation
            {
                PublicId = Guid.NewGuid(),
                ProjectId = project.Id,
                Email = email,
            };
            Reset(convite, papel, dias);
            await _unitOfWork.ProjectInvitations.AddAsync(convite, cancellationToken);
            tipo = EventTypeEnum.ProjectInvitationSent;
        }
        else
        {
            // Convidar de novo o mesmo endereco reenvia o convite aberto, em vez de
            // empilhar links que valeriam ao mesmo tempo.
            //
            // Sem `Update`: a entidade ja e rastreada, e so o que mudou e gravado. O
            // `Update` marcaria toda coluna — inclusive `accepted_at`, gravando de
            // volta o nulo lido antes de um aceite que aconteceu no meio.
            Reset(convite, papel, dias);
        }

        await AddEventAsync(project, tipo, convite, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);
        await PublishAsync(convite, cancellationToken);

        return await MapWithInviterAsync(convite, cancellationToken);
    }

    public async Task<ProjectInvitationViewModel> ResendAsync(Guid projectPublicId, Guid invitationPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var convite = await RequireOpenInvitationAsync(project, invitationPublicId, cancellationToken);

        EnsureCanSend();
        await EnsureWithinHourlyLimitAsync(project, cancellationToken);

        // Rastreada: so o que mudou e gravado (ver CreateAsync).
        Reset(convite, convite.Role, await ValidityDaysAsync(project, cancellationToken));

        await AddEventAsync(project, EventTypeEnum.ProjectInvitationResent, convite, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);
        await PublishAsync(convite, cancellationToken);

        return await MapWithInviterAsync(convite, cancellationToken);
    }

    public async Task RevokeAsync(Guid projectPublicId, Guid invitationPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var convite = await RequireOpenInvitationAsync(project, invitationPublicId, cancellationToken);

        convite.RevokedAt = DateTime.UtcNow;

        await AddEventAsync(project, EventTypeEnum.ProjectInvitationRevoked, convite, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);
    }

    // ─── A pessoa convidada, pelo link ────────────────────────────────────────

    public async Task<InvitationPreviewViewModel> PreviewAsync(InvitationTokenDto dto, CancellationToken cancellationToken = default)
    {
        var (convite, eu) = await RequireByTokenAsync(dto, cancellationToken);
        var agora = DateTime.UtcNow;

        var status = await StatusForAsync(convite, eu, agora, cancellationToken);

        // Com a conta errada, nada do projeto: quem esta do outro lado nao e a
        // pessoa convidada, e o nome do projeto e de quem convidou nao sao dela.
        if (status is InvitationPreviewStatusEnum.WrongAccount or InvitationPreviewStatusEnum.EmailNotVerified)
            return new InvitationPreviewViewModel(status, null, null, null, null, null, Hint(convite.Email));

        return new InvitationPreviewViewModel(
            status,
            convite.Project.PublicId,
            convite.Project.Name,
            InviterName(convite.InvitedByUser),
            convite.Role,
            convite.ExpiresAt,
            null);
    }

    public async Task<AcceptedInvitationViewModel> AcceptAsync(InvitationTokenDto dto, CancellationToken cancellationToken = default)
    {
        var (convite, eu) = await RequireByTokenAsync(dto, cancellationToken);
        var agora = DateTime.UtcNow;

        switch (await StatusForAsync(convite, eu, agora, cancellationToken))
        {
            case InvitationPreviewStatusEnum.WrongAccount:
                throw new ForbiddenException("Este convite e para outro e-mail. Entre com a conta Google do endereco convidado.");

            case InvitationPreviewStatusEnum.EmailNotVerified:
                throw new ForbiddenException("O Google ainda nao confirmou este e-mail. Confirme o endereco na sua conta Google e entre de novo.");

            case InvitationPreviewStatusEnum.Expired:
                throw new ConflictException("Este convite venceu. Peca um novo a quem convidou.");

            case InvitationPreviewStatusEnum.AlreadyAccepted:
                // Aceitar duas vezes nao e erro: a pessoa ja esta no time, e o painel
                // so precisa saber para onde levar.
                return new AcceptedInvitationViewModel(convite.Project.PublicId, convite.Project.Name);

            case InvitationPreviewStatusEnum.AlreadyMember:
                // Ja estava no time — ou e dona. O convite fecha como aceito, para nao
                // ficar aberto na tela de quem convidou.
                Close(convite, eu, agora);
                await _unitOfWork.CommitAsync(cancellationToken);
                return new AcceptedInvitationViewModel(convite.Project.PublicId, convite.Project.Name);
        }

        await _unitOfWork.ProjectMembers.AddAsync(new ProjectMember
        {
            ProjectId = convite.ProjectId,
            UserId = eu.Id,
            Role = convite.Role,
        }, cancellationToken);

        Close(convite, eu, agora);

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = convite.Project.AccountId,
            ProjectId = convite.ProjectId,
            UserId = eu.Id,
            Type = EventTypeEnum.ProjectInvitationAccepted,
            Source = EventSourceEnum.Panel,
            Payload = JsonSerializer.Serialize(new
            {
                invitation_public_id = convite.PublicId,
                role = Snake(convite.Role),
            }),
        }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);
        await _notifier.ProjectChangedAsync(convite.Project.PublicId);

        return new AcceptedInvitationViewModel(convite.Project.PublicId, convite.Project.Name);
    }

    // ─── O consumidor da fila ─────────────────────────────────────────────────

    public async Task SendEmailAsync(Guid invitationPublicId, CancellationToken cancellationToken = default)
    {
        // Lido sem rastreio: tudo o que este metodo grava e condicional, contra a
        // linha que foi lida. Um reenvio no meio muda a linha, e o pedido novo dele,
        // ja na fila, e quem manda o e-mail que vale.
        var convite = await _unitOfWork.ProjectInvitations.GetForEmailWithoutSessionAsync(invitationPublicId, cancellationToken);

        // Fechou, ja saiu ou ja esta saindo: mensagem repetida, ou convite cancelado
        // depois de entrar na fila. Nada a fazer — e e isso que torna a repeticao
        // inofensiva.
        if (convite is null || !convite.IsOpen || convite.EmailStatus != InvitationEmailStatusEnum.Pending)
            return;

        var agora = DateTime.UtcNow;
        var link = EnvironmentConstants.GetPanelUrl();

        if (convite.IsExpiredAt(agora) || link is null || !_emailSender.IsAvailable)
        {
            await _unitOfWork.ProjectInvitations.FailPendingWithoutSessionAsync(
                convite.Id, convite.UpdatedAt, convite.IsExpiredAt(agora) ? "expired" : "email_unavailable", agora, cancellationToken);
            return;
        }

        // O link nasce aqui, e o hash entra no banco **na propria reserva**, antes do
        // envio: um e-mail que saisse antes de o hash estar gravado levaria um link
        // que nao abre nada. So um consumidor passa da reserva — e so se a linha
        // ainda e a lida, entao o e-mail montado abaixo diz o papel e o prazo que valem.
        var token = InvitationToken.Generate();
        var hash = InvitationToken.Hash(token);

        if (!await _unitOfWork.ProjectInvitations.TryClaimForSendingWithoutSessionAsync(convite.Id, convite.UpdatedAt, hash, agora, cancellationToken))
            return;

        try
        {
            var dias = Math.Max(1, (int)Math.Ceiling((convite.ExpiresAt - agora).TotalDays));
            var mensagem = InvitationEmailComposer.Compose(
                convite.Email,
                convite.Project.Name,
                InviterName(convite.InvitedByUser),
                convite.Role,
                dias,
                new Uri($"{link.AbsoluteUri.TrimEnd('/')}/invite#t={token}"));

            await _emailSender.SendAsync(mensagem, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // A aplicacao desceu no meio do envio. Nao da para saber se o servidor
            // aceitou; "nao saiu" e o lado seguro — a tela oferece reenviar, e o
            // reenvio sorteia link novo. Sem isso, o convite ficaria "enviando" ate
            // uma subida que acontecesse mais de dez minutos depois.
            await FinishQuietlyAsync(convite.Id, hash, InterruptedError);
            throw;
        }
        catch (Exception erro)
        {
            // Inclusive o tempo esgotado do servidor, que pode chegar como
            // cancelamento sem a aplicacao estar descendo.
            //
            // O tipo, e nunca a mensagem: o servidor costuma repetir o endereco de
            // quem recebe nela, e o log nao guarda dado da pessoa.
            _logger.LogError(
                "E-mail do convite {Invitation} nao saiu: {Erro}.", convite.PublicId, erro.GetType().Name);

            await _unitOfWork.ProjectInvitations.FinishSendingWithoutSessionAsync(
                convite.Id, hash, sent: false, erro.GetType().Name, DateTime.UtcNow, CancellationToken.None);
            return;
        }

        // Depois de o servidor aceitar, nada cancela: a mensagem ja saiu.
        if (await _unitOfWork.ProjectInvitations.FinishSendingWithoutSessionAsync(
                convite.Id, hash, sent: true, error: null, DateTime.UtcNow, CancellationToken.None))
            _logger.LogInformation("E-mail do convite {Invitation} entregue ao servidor.", convite.PublicId);
        else
            _logger.LogInformation(
                "E-mail do convite {Invitation} entregue, mas o convite foi reenviado no meio: o link deste ja nao vale.", convite.PublicId);
    }

    /// <summary>
    /// Fecha como "nao saiu" um envio interrompido. Melhor esforco: se nem o banco
    /// responde, a varredura da proxima subida resolve.
    /// </summary>
    private async Task FinishQuietlyAsync(long invitationId, string hash, string motivo)
    {
        try
        {
            await _unitOfWork.ProjectInvitations.FinishSendingWithoutSessionAsync(
                invitationId, hash, sent: false, motivo, DateTime.UtcNow, CancellationToken.None);
        }
        catch (Exception erro)
        {
            _logger.LogWarning("Envio do convite interrompido, e a marca de falha nao gravou: {Erro}.", erro.GetType().Name);
        }
    }

    public async Task<IReadOnlyList<Guid>> RecoverEmailsAsync(CancellationToken cancellationToken = default)
    {
        var presos = await _unitOfWork.ProjectInvitations.FailStuckSendingWithoutSessionAsync(
            DateTime.UtcNow - StuckSendingAfter, InterruptedError, cancellationToken);

        if (presos > 0)
            _logger.LogWarning("{Count} e-mail(s) de convite presos no meio do envio marcados como falha.", presos);

        return await _unitOfWork.ProjectInvitations.ListPendingEmailWithoutSessionAsync(cancellationToken);
    }

    // ─── Pecas ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Por que este servidor nao manda convite — ou nulo, quando manda. Sao tres
    /// pecas, e todas no .env.local: o servidor de e-mail, a fila e o endereco do
    /// painel que vai no link.
    /// </summary>
    private InvitationUnavailableReasonEnum? UnavailableReason()
    {
        if (!_emailSender.IsAvailable)
            return InvitationUnavailableReasonEnum.EmailNotConfigured;

        if (!_emailQueue.IsAvailable)
            return InvitationUnavailableReasonEnum.QueueNotConfigured;

        if (EnvironmentConstants.GetPanelUrl() is null)
            return InvitationUnavailableReasonEnum.PanelUrlNotConfigured;

        return null;
    }

    private void EnsureCanSend()
    {
        if (UnavailableReason() is not null)
            throw new ConflictException("O envio de convites nao esta configurado neste servidor.");
    }

    private async Task EnsureWithinHourlyLimitAsync(Project project, CancellationToken cancellationToken)
    {
        var limite = EnvironmentConstants.GetInvitationEmailsPerHour();
        var naUltimaHora = await _unitOfWork.Events.CountInvitationEmailsSinceAsync(
            project.Id, DateTime.UtcNow.AddHours(-1), cancellationToken);

        if (naUltimaHora >= limite)
            throw new ConflictException(
                $"Este projeto ja mandou {limite} convites na ultima hora. Tente de novo mais tarde.");
    }

    /// <summary>
    /// Prepara o convite para sair de novo: papel, prazo e envio do zero, e o link
    /// anterior apagado — o hash volta a nulo e so o proximo e-mail traz um que vale.
    /// </summary>
    private void Reset(ProjectInvitation convite, ProjectRoleEnum papel, int dias)
    {
        var agora = DateTime.UtcNow;

        convite.Role = papel;
        convite.InvitedByUserId = _accountContext.UserId
                                  ?? throw new UnauthorizedAccessException("Sessao nao identificada.");
        convite.ExpiresAt = agora.AddDays(dias);
        convite.TokenHash = null;
        convite.EmailStatus = InvitationEmailStatusEnum.Pending;
        convite.EmailAttemptedAt = null;
        convite.EmailSentAt = null;
        convite.EmailError = null;
    }

    /// <summary>
    /// Depois de gravar. Se a fila recusar, o convite fica marcado como "nao saiu" —
    /// a tela mostra e oferece reenviar —, e o erro vai para o log, e nao para quem
    /// clicou: o convite existe, so o e-mail e que nao saiu.
    /// </summary>
    private async Task PublishAsync(ProjectInvitation convite, CancellationToken cancellationToken)
    {
        try
        {
            await _emailQueue.EnqueueAsync(EmailJobKind.Invitation, convite.PublicId, cancellationToken);
        }
        catch (Exception erro) when (erro is not OperationCanceledException)
        {
            _logger.LogError(
                "Convite {Invitation} gravado, mas a fila recusou o e-mail: {Erro}.", convite.PublicId, erro.GetType().Name);

            await MarkFailedAsync(convite, QueueError, cancellationToken);
        }
    }

    private async Task MarkFailedAsync(ProjectInvitation convite, string motivo, CancellationToken cancellationToken)
    {
        convite.EmailStatus = InvitationEmailStatusEnum.Failed;
        convite.EmailError = motivo.Length > ProjectInvitation.MaxEmailErrorLength
            ? motivo[..ProjectInvitation.MaxEmailErrorLength]
            : motivo;
        await _unitOfWork.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// O convite do link e a pessoa logada. Link que nao existe, cancelado ou trocado
    /// por um reenvio respondem igual: o convite nao vale mais.
    /// </summary>
    private async Task<(ProjectInvitation Convite, User Eu)> RequireByTokenAsync(InvitationTokenDto dto, CancellationToken cancellationToken)
    {
        var token = (dto.Token ?? string.Empty).Trim();

        if (token.Length is 0 or > 200)
            throw new KeyNotFoundException(GoneMessage);

        var convite = await _unitOfWork.ProjectInvitations.FindByTokenHashWithoutSessionAsync(
                          InvitationToken.Hash(token), cancellationToken)
                      ?? throw new KeyNotFoundException(GoneMessage);

        if (convite.RevokedAt is not null)
            throw new KeyNotFoundException(GoneMessage);

        var eu = await _unitOfWork.Users.GetByIdAsync(
                     _accountContext.UserId ?? throw new UnauthorizedAccessException("Sessao nao identificada."),
                     cancellationToken)
                 ?? throw new UnauthorizedAccessException("Sessao nao identificada.");

        return (convite, eu);
    }

    /// <summary>
    /// O que este convite e para esta pessoa. A conta vem primeiro: com a conta
    /// errada, nem o prazo nem o projeto sao da conta dela.
    /// </summary>
    private async Task<InvitationPreviewStatusEnum> StatusForAsync(ProjectInvitation convite, User eu, DateTime agora, CancellationToken cancellationToken)
    {
        if (convite.AcceptedAt is not null)
        {
            if (convite.AcceptedByUserId != eu.Id)
                return InvitationPreviewStatusEnum.WrongAccount;

            // Aceito por ela, e ela continua no time: so falta levar ate o projeto.
            if (await IsInTeamAsync(convite, eu, cancellationToken))
                return InvitationPreviewStatusEnum.AlreadyAccepted;

            // Aceito, e depois ela saiu do time: o link ja foi usado, e voltar pede
            // convite novo. "Voce ja esta no time" levaria a um projeto que responde
            // "nao encontrado".
            throw new KeyNotFoundException(GoneMessage);
        }

        if (Normalize(eu.Email) != convite.Email)
            return InvitationPreviewStatusEnum.WrongAccount;

        if (!eu.EmailVerified)
            return InvitationPreviewStatusEnum.EmailNotVerified;

        if (convite.IsExpiredAt(agora))
            return InvitationPreviewStatusEnum.Expired;

        if (await IsInTeamAsync(convite, eu, cancellationToken))
            return InvitationPreviewStatusEnum.AlreadyMember;

        return InvitationPreviewStatusEnum.Valid;
    }

    /// <summary>Se a pessoa ja enxerga o projeto do convite: e dona, ou esta no time.</summary>
    private async Task<bool> IsInTeamAsync(ProjectInvitation convite, User eu, CancellationToken cancellationToken)
        => eu.AccountId == convite.Project.AccountId
           || await _unitOfWork.ProjectMembers.ExistsWithoutSessionAsync(convite.ProjectId, eu.Id, cancellationToken);

    private static void Close(ProjectInvitation convite, User eu, DateTime agora)
    {
        convite.AcceptedAt = agora;
        convite.AcceptedByUserId = eu.Id;
    }

    private Task AddEventAsync(Project project, EventTypeEnum tipo, ProjectInvitation convite, CancellationToken cancellationToken)
        // O endereco nao vai no payload: esta tabela nao se apaga, e ele e dado da
        // pessoa — fica no convite, que se apaga.
        => _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            UserId = _accountContext.UserId,
            Type = tipo,
            Source = EventSourceEnum.Panel,
            Payload = JsonSerializer.Serialize(new
            {
                invitation_public_id = convite.PublicId,
                role = Snake(convite.Role),
            }),
        }, cancellationToken);

    private async Task<int> ValidityDaysAsync(Project project, CancellationToken cancellationToken)
        => (await _unitOfWork.ProjectTeamSettings.GetByProjectAsync(project.Id, cancellationToken))?.InvitationValidityDays
           ?? TeamSettingsDefaults.InvitationValidityDays;

    private async Task<ProjectInvitation> RequireOpenInvitationAsync(Project project, Guid invitationPublicId, CancellationToken cancellationToken)
    {
        var convite = await _unitOfWork.ProjectInvitations.GetByPublicIdAsync(invitationPublicId, cancellationToken);

        // O convite e conferido contra o projeto da rota: o filtro so garante que a
        // pessoa enxerga o projeto dele, e um administrador de dois projetos nao
        // pode cancelar o convite de um pela rota do outro.
        if (convite is null || convite.ProjectId != project.Id || !convite.IsOpen)
            throw new KeyNotFoundException("Convite nao encontrado.");

        return convite;
    }

    /// <summary>
    /// Quem convidou e lido de novo: convidar ou reenviar troca quem convidou para
    /// quem clicou, e a navegacao carregada antes ainda apontaria para o anterior.
    /// </summary>
    private async Task<ProjectInvitationViewModel> MapWithInviterAsync(ProjectInvitation convite, CancellationToken cancellationToken)
    {
        var quem = await _unitOfWork.Users.GetByIdAsync(convite.InvitedByUserId, cancellationToken);
        return Map(convite, DateTime.UtcNow, quem is null ? null : InviterName(quem));
    }

    private static ProjectInvitationViewModel Map(ProjectInvitation convite, DateTime agora)
        => Map(convite, agora, convite.InvitedByUser is null ? null : InviterName(convite.InvitedByUser));

    private static ProjectInvitationViewModel Map(ProjectInvitation convite, DateTime agora, string? convidadoPor) => new(
        convite.PublicId,
        convite.Email,
        convite.Role,
        convidadoPor,
        convite.CreatedAt,
        convite.ExpiresAt,
        convite.IsExpiredAt(agora),
        convite.EmailStatus,
        convite.EmailSentAt);

    /// <summary>
    /// Um endereco, em minusculas e conferido. So o endereco: nome junto
    /// ("Fulano &lt;f@x.com&gt;"), lista ou dominio sem ponto sao recusados.
    /// </summary>
    internal static string NormalizeEmail(string? valor)
    {
        var email = Normalize(valor);

        if (email is null
            || email.Length > ProjectInvitation.MaxEmailLength
            || email.IndexOfAny([' ', ',', ';', '<', '>', '\r', '\n', '\t']) >= 0
            || !MailAddress.TryCreate(email, out var lido)
            || lido.Address != email
            || !lido.Host.Contains('.'))
            throw new ArgumentException("Informe um e-mail valido.");

        return email;
    }

    private static string? Normalize(string? valor)
        => string.IsNullOrWhiteSpace(valor) ? null : valor.Trim().ToLowerInvariant();

    /// <summary>A pista do endereco convidado: a primeira letra e o dominio — c•••@gmail.com.</summary>
    private static string Hint(string email)
    {
        var arroba = email.IndexOf('@');
        return arroba <= 0 ? "•••" : $"{email[0]}•••{email[arroba..]}";
    }

    private static string InviterName(User pessoa)
        => !string.IsNullOrWhiteSpace(pessoa.Name) ? pessoa.Name.Trim()
            : !string.IsNullOrWhiteSpace(pessoa.Email) ? pessoa.Email
            : "Alguém do time";

    private static string Snake(ProjectRoleEnum papel)
        => papel == ProjectRoleEnum.Administrator ? "administrator" : "member";

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
