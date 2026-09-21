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
using Pds.Service.Security;
using Pds.Service.Reports;
using Pds.Translation;

namespace Pds.Service.Services;

public class ReportService : IReportService
{
    /// <summary>
    /// Quantas vezes tentar um protocolo novo antes de desistir. Com 32^12
    /// combinacoes, chegar na segunda tentativa ja e raro; chegar na sexta significa
    /// que alguma coisa esta errada no sorteio, e ai falhar alto e melhor do que
    /// insistir em silencio.
    /// </summary>
    private const int TrackingCodeAttempts = 5;

    /// <summary>Teto de pares de contexto por relato, para o corpo da requisicao nao virar deposito.</summary>
    private const int MaxContextEntries = 30;

    /// <summary>Quantos relatos a lista do painel traz quando ninguem pede outra coisa.</summary>
    private const int DefaultPageSize = 20;

    /// <summary>
    /// Teto por pagina. O texto do relato vai inteiro na lista, entao uma pagina de
    /// mil linhas seriam megabytes numa resposta que a tela nao desenha.
    /// </summary>
    private const int MaxPageSize = 100;

    /// <summary>
    /// A recusa da consulta publica, escrita uma vez. Ela fala do <b>link</b> e nao
    /// do protocolo: quem chegou aqui clicou num link, e mandar a pessoa conferir o
    /// protocolo que ela nao digitou nao ajuda em nada.
    /// </summary>
    /// <summary>
    /// A palavra que a rota aceita no lugar de um identificador, para pedir os
    /// relatos que ainda nao tem lugar na fila. E uma constante porque aparece na
    /// conferencia e na mensagem de erro, e as duas precisam dizer a mesma coisa.
    /// </summary>
    private const string WithoutStateFilter = "none";

    private const string TrackingRefusal = "Este link nao abre nenhum relato. Confira se ele veio inteiro.";

    private readonly IUnitOfWork _unitOfWork;

    /// <summary>
    /// Quem esta logado, para o evento saber quem moveu.
    ///
    /// <para>Fica anulavel de proposito: este mesmo servico atende as rotas
    /// publicas, onde nao ha sessao nenhuma. Exigir usuario aqui quebraria a
    /// entrada do relato, que e justamente a que vem de um desconhecido.</para>
    /// </summary>
    private readonly IAccountContext _accountContext;

    /// <summary>
    /// Quem marca a hora de olhar de novo, quando o projeto configurou espera.
    ///
    /// <para><b>E uma interface, e o servico nao sabe o que ha do outro lado.</b>
    /// Fila, banco, temporizador: no dia em que o transporte mudar, o que decide o
    /// movimento do relato nao muda junto.</para>
    /// </summary>
    private readonly IDelayedScheduler _scheduler;

    public ReportService(IUnitOfWork unitOfWork, IAccountContext accountContext, IDelayedScheduler scheduler)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
        _scheduler = scheduler;
    }

    public async Task<CreatedReportViewModel> CreateAsync(CreateReportDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(dto.Key, cancellationToken);

        // Arquivar para de aceitar coisa nova sem perder o que ja entrou. E o motivo
        // de a recusa ser 403 e nao 404: o projeto existe, e a chave esta certa.
        if (project.Status == ProjectStatusEnum.Archived)
            throw new ForbiddenException("Este projeto esta arquivado e nao aceita relatos novos.");

        // A lista de enderecos autorizados, conferida aqui tambem e nao so na
        // leitura da configuracao: la ela evita que o formulario abra onde nao
        // devia, e aqui ela e o que de fato impede o relato de entrar. Sem esta,
        // bastaria falar direto com a rota para a lista nao valer nada.
        //
        // So vai ao banco quando a pagina declarou de onde veio: sem endereco nao
        // ha o que comparar com a lista.
        if (OriginAllowList.Declares(dto.Origin))
        {
            var origins = await _unitOfWork.ProjectOrigins.ListByProjectWithoutSessionAsync(project.Id, cancellationToken);

            if (!OriginAllowList.Allows(origins, dto.Origin))
                throw new ForbiddenException("Este endereco nao esta autorizado a abrir relato neste projeto.");
        }

        if (dto.Type is null)
            throw new ArgumentException("Informe o tipo do relato.");

        var text = (dto.Text ?? string.Empty).Trim();

        if (text.Length == 0)
            throw new ArgumentException("Escreva o relato.");

        if (text.Length > Report.MaxTextLength)
            throw new ArgumentException($"O relato pode ter ate {Report.MaxTextLength} caracteres.");

        var (token, tokenHash) = AccessToken.Generate();

        var landingStateId = await ResolveLandingStateAsync(project.Id, dto.Type.Value, cancellationToken);

        // **Campo ausente vale o padrao do projeto, e nao o mais restritivo.** A
        // ferramenta sempre manda o que a pessoa marcou; quem omite e uma versao
        // antiga dela, ou alguem falando direto com a rota — e silenciar o relato
        // por isso seria punir quem escreveu por um descompasso que nao e dele.
        var regras = await _unitOfWork.ProjectCycleSettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        var aceitaDuvidas = dto.AcceptsQuestions
                            ?? regras?.AcceptsQuestionsDefault
                            ?? CycleSettingsDefaults.AcceptsQuestionsDefault;

        var codigoPessoal = await ResolveReporterCodeAsync(project.Id, dto.ReporterCode, cancellationToken);

        var report = new Report
        {
            ReporterCode = codigoPessoal,
            AccountId = project.AccountId,
            ProjectId = project.Id,
            TrackingCode = await GenerateTrackingCodeAsync(cancellationToken),
            AccessTokenHash = tokenHash,
            Type = dto.Type.Value,
            Text = text,
            Route = SanitizeRoute(dto.Route),
            Origin = Trim(dto.Origin, 260),
            ProjectStateId = landingStateId,
            AcceptsQuestions = aceitaDuvidas,
            Contexts = BuildContexts(dto.Context),
        };

        await _unitOfWork.Reports.AddAsync(report, cancellationToken);

        // O evento nasce na mesma gravacao que o relato: se ele ficasse para depois,
        // uma falha no meio deixaria relato sem evento, e a contagem da pesquisa
        // passaria a mentir em silencio.
        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            Report = report,
            Type = EventTypeEnum.ReportCreated,
            Source = EventSourceEnum.Widget,
            Payload = JsonSerializer.Serialize(new
            {
                type = report.Type.ToString().ToLowerInvariant(),
                origin = report.Origin,
                route = report.Route,
                text_length = report.Text.Length,
            }),
        }, cancellationToken);

        // E ja nasce numa etapa da jornada, se houver uma para ele.
        //
        // **Traduzir so no movimento nao bastaria**: o relato que chega e nunca e
        // movido ficaria invisivel para quem o escreveu — a pagina de acompanhamento
        // abriria sem nada, justamente no momento em que a pessoa mais quer olhar.
        //
        // As leituras sao as **sem sessao**: o relato entra pela chave publica, e ali
        // a conta atual e zero.
        if (landingStateId is long landing)
        {
            var mapa = await _unitOfWork.ProjectStatusMappings
                .ListByVersionWithoutSessionAsync(project.Id, project.MappingVersion, cancellationToken);
            var etapas = await _unitOfWork.ProjectPublicStages
                .ListByProjectWithoutSessionAsync(project.Id, cancellationToken);

            await ApplyPublicStageAsync(project, report, landing, EventSourceEnum.Widget, null, mapa, etapas, cancellationToken);
        }

        await _unitOfWork.CommitAsync(cancellationToken);

        return new CreatedReportViewModel(report.TrackingCode, token, report.CreatedAt, codigoPessoal?.Code);
    }

    /// <summary>
    /// O relato por tras de um link de acompanhamento, ou a recusa.
    ///
    /// <para><b>Uma recusa so para tudo que da errado aqui</b>: protocolo em
    /// branco, token em branco, protocolo que nao existe e token que nao e daquele
    /// relato. Quatro mensagens diferentes contariam a quem sonda de qual delas ele
    /// esta perto.</para>
    ///
    /// <para><b>E a porta das tres rotas publicas</b> — abrir, confirmar e reabrir.
    /// Ter uma so porta e o que garante que as duas que escrevem sejam tao exigentes
    /// quanto a que le: a que le nasceu primeiro, e repetir o confronto a mao nas
    /// outras duas seria esperar que ninguem esquecesse nada.</para>
    /// </summary>
    private async Task<Report> RequireTrackedReportAsync(string? trackingCode, string? token, CancellationToken cancellationToken)
    {
        var code = (trackingCode ?? string.Empty).Trim().ToUpperInvariant();
        var value = (token ?? string.Empty).Trim();

        if (code.Length == 0 || value.Length == 0)
            throw new KeyNotFoundException(TrackingRefusal);

        var report = await _unitOfWork.Reports.FindByTrackingCodeWithoutSessionAsync(code, cancellationToken);

        if (report is null)
            throw new KeyNotFoundException(TrackingRefusal);

        // Tempo constante: um `==` comum para no primeiro caractere diferente, e a
        // diferenca de tempo entre parar no primeiro e parar no decimo permite
        // descobrir o token caractere a caractere — com o protocolo em maos, que e
        // adivinhavel.
        if (!ProjectKeyGenerator.Matches(value, report.AccessTokenHash))
            throw new KeyNotFoundException(TrackingRefusal);

        return report;
    }

    public async Task<PublicReportViewModel> OpenTrackingAsync(OpenReportTrackingDto dto, CancellationToken cancellationToken = default)
    {
        var report = await RequireTrackedReportAsync(dto.TrackingCode, dto.Token, cancellationToken);

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = report.AccountId,
            ProjectId = report.ProjectId,
            ReportId = report.Id,
            Type = EventTypeEnum.ReportViewed,
            Source = EventSourceEnum.PublicPage,
            // Sem carga: origem, momento, projeto e relato ja sao colunas, e a
            // origem `PublicPage` ja diz que quem abriu foi quem relatou.
            Payload = null,
        }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        return await BuildPublicAsync(report, cancellationToken);
    }

    public async Task<PublicReportViewModel> ConfirmAsync(ConfirmReportDto dto, CancellationToken cancellationToken = default)
    {
        var report = await RequireTrackedReportAsync(dto.TrackingCode, dto.Token, cancellationToken);
        var regras = await _unitOfWork.ProjectCycleSettings
            .FindByProjectWithoutSessionAsync(report.ProjectId, cancellationToken);

        var fechamento = await _unitOfWork.ReportClosures
            .FindPublicWithoutSessionAsync(report.Id, DateTime.UtcNow, cancellationToken)
            ?? throw new ConflictException("Este relato ainda nao foi encerrado.");

        // Confirmar duas vezes nao e engano de digitacao: e o segundo clique, ou a
        // aba que ficou aberta. Recusar preserva o instante da primeira resposta,
        // que e o dado que a pesquisa compara com o do encerramento.
        if (fechamento.ConfirmedAt is not null)
            throw new ConflictException("Voce ja respondeu sobre este relato.");

        var pedeNota = regras?.SatisfactionEnabled ?? CycleSettingsDefaults.SatisfactionEnabled;
        var notaObrigatoria = regras?.SatisfactionRequired ?? CycleSettingsDefaults.SatisfactionRequired;

        // Projeto que nao pede nota **descarta** o que vier, em vez de recusar. Quem
        // manda isto e a nossa propria pagina, e recusar a confirmacao por causa de
        // um campo que a pessoa nao escolheu mandar faria ela perder a acao por um
        // erro que nao e dela. O contrario do movimento, onde quem afirma e o time.
        var nota = pedeNota ? dto.Satisfaction : null;
        var recusou = pedeNota && dto.SatisfactionDeclined;

        if (nota is not null && recusou)
            throw new ArgumentException("Escolha a nota ou marque que prefere nao responder — nao os dois.");

        if (nota is int valor && (valor < ReportClosure.MinSatisfaction || valor > ReportClosure.MaxSatisfaction))
            throw new ArgumentException($"A nota vai de {ReportClosure.MinSatisfaction} a {ReportClosure.MaxSatisfaction}.");

        // **Obrigatoria continua tendo saida.** "Prefiro nao responder" satisfaz a
        // exigencia, e fica fora da escala: sem a saida, a obrigacao vira clique sem
        // pensar e a media passa a medir o clique.
        if (pedeNota && notaObrigatoria && nota is null && !recusou)
            throw new ArgumentException("Responda a nota, ou marque que prefere nao responder.");

        fechamento.ConfirmedAt = DateTime.UtcNow;
        fechamento.Satisfaction = nota;
        fechamento.SatisfactionDeclined = recusou;
        _unitOfWork.ReportClosures.Update(fechamento);

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = report.AccountId,
            ProjectId = report.ProjectId,
            ReportId = report.Id,
            // Sem usuario: quem confirmou nao e do time, e nao tem usuario aqui. E a
            // origem que conta quem foi.
            Type = EventTypeEnum.ReportConfirmed,
            Source = EventSourceEnum.PublicPage,
            // A nota vai porque e numero, e numero e o que a contagem quer ler numa
            // tabela que so cresce. A recusa vai junto e **separada**, porque nao e
            // nota zero.
            Payload = JsonSerializer.Serialize(new
            {
                satisfaction = nota,
                satisfaction_declined = recusou,
            }),
        }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        return await BuildPublicAsync(report, cancellationToken);
    }

    public async Task<PublicReportViewModel> ReopenAsync(ReopenReportDto dto, CancellationToken cancellationToken = default)
    {
        var report = await RequireTrackedReportAsync(dto.TrackingCode, dto.Token, cancellationToken);
        var project = report.Project;

        var regras = await _unitOfWork.ProjectCycleSettings
            .FindByProjectWithoutSessionAsync(report.ProjectId, cancellationToken);

        if (!(regras?.AllowsReopen ?? CycleSettingsDefaults.AllowsReopen))
            throw new ForbiddenException("Este projeto nao aceita reabrir um relato encerrado.");

        var fechamento = await _unitOfWork.ReportClosures
            .FindPublicWithoutSessionAsync(report.Id, DateTime.UtcNow, cancellationToken)
            ?? throw new ConflictException("Este relato ainda nao foi encerrado.");

        // **Quem confirmou fechou a conversa.** O problema que volta depois disso e
        // outro relato, com outro historico — e reabrir aqui misturaria dois casos
        // numa linha do tempo so.
        if (fechamento.ConfirmedAt is not null)
            throw new ConflictException("Voce ja confirmou que este relato foi resolvido.");

        var pedeComentario = regras?.ReopenRequiresComment ?? CycleSettingsDefaults.ReopenRequiresComment;
        var comentario = (dto.Comment ?? string.Empty).Trim();

        if (pedeComentario && comentario.Length == 0)
            throw new ArgumentException("Conte o que ainda esta acontecendo.");

        if (comentario.Length > ReportClosure.MaxReopenCommentLength)
            throw new ArgumentException($"O comentario pode ter ate {ReportClosure.MaxReopenCommentLength} caracteres.");

        var destino = await ResolveReopenStateAsync(report.ProjectId, regras?.ReopenState, cancellationToken);

        fechamento.ReopenedAt = DateTime.UtcNow;
        fechamento.ReopenComment = comentario.Length > 0 ? comentario : null;
        _unitOfWork.ReportClosures.Update(fechamento);

        var origem = report.ProjectState;

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = report.AccountId,
            ProjectId = report.ProjectId,
            ReportId = report.Id,
            Type = EventTypeEnum.ReportReopened,
            Source = EventSourceEnum.PublicPage,
            // O comentario **nao** vai junto, pela mesma razao que o texto do
            // comentario nao vai: e texto de uma pessoa, e esta tabela nao se
            // consegue limpar. Ele mora no fechamento reaberto.
            Payload = JsonSerializer.Serialize(new
            {
                comment_length = comentario.Length,
                outcome = fechamento.Outcome.ToString(),
            }),
        }, cancellationToken);

        // **Sao dois eventos para uma acao, e os dois sao verdade.** A pessoa
        // reabriu, e o relato mudou de coluna. Juntar os dois obrigaria o historico
        // a tratar a reabertura como um caso especial do movimento — e o movimento
        // continua sendo movimento, tenha sido quem tiver mexido. A origem
        // `PublicPage` e o que diz que nao foi o time.
        if (destino is not null && report.ProjectStateId != destino.Id)
        {
            await _unitOfWork.Events.AddAsync(new Event
            {
                AccountId = report.AccountId,
                ProjectId = report.ProjectId,
                ReportId = report.Id,
                Type = EventTypeEnum.ReportStateChanged,
                Source = EventSourceEnum.PublicPage,
                Payload = JsonSerializer.Serialize(new
                {
                    from_id = origem?.PublicId,
                    from_name = origem?.Name,
                    to_id = destino.PublicId,
                    to_name = destino.Name,
                }),
            }, cancellationToken);

            report.ProjectStateId = destino.Id;
            report.ProjectState = destino;
            _unitOfWork.Reports.Update(report);
        }

        // E a jornada publica volta junto. Projeto sem coluna ativa nenhuma nao tem
        // para onde voltar, e ai o relato reabre sem sair do lugar — o fechamento
        // deixou de valer, que e o que a pessoa pediu.
        if (destino is not null)
        {
            var mapa = await _unitOfWork.ProjectStatusMappings
                .ListByVersionWithoutSessionAsync(report.ProjectId, project.MappingVersion, cancellationToken);
            var etapas = await _unitOfWork.ProjectPublicStages
                .ListByProjectWithoutSessionAsync(report.ProjectId, cancellationToken);

            await ApplyPublicStageAsync(
                project, report, destino.Id, EventSourceEnum.PublicPage, null,
                mapa, etapas, cancellationToken, reopening: true);
        }

        await _unitOfWork.CommitAsync(cancellationToken);

        return await BuildPublicAsync(report, cancellationToken);
    }

    /// <summary>
    /// Para qual coluna o relato reaberto volta.
    ///
    /// <para>A escolhida pelo projeto, se ainda estiver ativa; senao, a primeira
    /// ativa. <b>A queda para o padrao existe porque aposentar e possivel depois de
    /// configurar</b> — e mandar o relato reaberto para uma coluna que ninguem olha
    /// seria perde-lo de novo, que e exatamente o que a reabertura existe para
    /// evitar.</para>
    ///
    /// <para>Nulo quando o projeto nao tem coluna ativa nenhuma. O relato reabre
    /// mesmo assim: o fechamento deixou de valer, que e o que a pessoa pediu.</para>
    /// </summary>
    private async Task<ProjectState?> ResolveReopenStateAsync(long projectId, ProjectState? configured, CancellationToken cancellationToken)
    {
        if (configured is not null && configured.IsActive)
            return configured;

        return await _unitOfWork.ProjectStates.FirstActiveWithoutSessionAsync(projectId, cancellationToken);
    }

    /// <summary>
    /// O relato como quem o escreveu o ve, montado campo a campo.
    ///
    /// <para><b>As regras do projeto entram aqui, e nao saem daqui.</b> Elas
    /// decidem o que a pessoa pode fazer, e o que sai e so a conclusao — mandar a
    /// configuracao crua entregaria a quem esta de fora como o cliente organiza o
    /// trabalho dele.</para>
    /// </summary>
    private async Task<PublicReportViewModel> BuildPublicAsync(Report report, CancellationToken cancellationToken)
    {
        // **O fechamento que ja vale la fora**, e nao o que existe por dentro. Com
        // espera configurada os dois diferem durante a janela de desfazer — e e
        // exatamente ai que a diferenca importa.
        var fechamento = await _unitOfWork.ReportClosures
            .FindPublicWithoutSessionAsync(report.Id, DateTime.UtcNow, cancellationToken);

        PublicClosureViewModel? publico = null;

        if (fechamento is not null)
        {
            var regras = await _unitOfWork.ProjectCycleSettings
                .FindByProjectWithoutSessionAsync(report.ProjectId, cancellationToken);

            var respondeu = fechamento.ConfirmedAt is not null;

            publico = new PublicClosureViewModel(
                fechamento.Outcome,
                fechamento.Reason,
                fechamento.ClosedAt,
                fechamento.ConfirmedAt,
                fechamento.Satisfaction,
                fechamento.SatisfactionDeclined,
                new PublicClosureActionsViewModel(
                    !respondeu,
                    // Quem confirmou fechou a conversa: o problema que volta depois
                    // disso e outro relato.
                    (regras?.AllowsReopen ?? CycleSettingsDefaults.AllowsReopen) && !respondeu,
                    regras?.SatisfactionEnabled ?? CycleSettingsDefaults.SatisfactionEnabled,
                    regras?.SatisfactionStyle ?? CycleSettingsDefaults.SatisfactionStyle,
                    regras?.SatisfactionRequired ?? CycleSettingsDefaults.SatisfactionRequired,
                    regras?.ReopenRequiresComment ?? CycleSettingsDefaults.ReopenRequiresComment));
        }

        // A conversa, em ordem, com os dois lados. Campo a campo, como a jornada:
        // nem o nome de quem escreveu do lado de dentro sai daqui.
        var falas = await _unitOfWork.ReportPublicComments
            .ListByReportWithoutSessionAsync(report.Id, cancellationToken);

        var pedido = await _unitOfWork.ReportInfoRequests
            .FindOpenWithoutSessionAsync(report.Id, cancellationToken);

        return new PublicReportViewModel(
            report.TrackingCode,
            report.Type,
            report.Text,
            report.CreatedAt,
            await BuildJourneyAsync(report, cancellationToken),
            publico,
            falas
                .Select(fala => new PublicMessageViewModel(
                    fala.PublicId, fala.UserId is null, fala.Body, fala.CreatedAt))
                .ToList(),
            pedido is null
                ? null
                : new PublicInfoRequestViewModel(
                    pedido.AskedAt, pedido.CloseAt, DateTime.UtcNow >= pedido.WarnAt),
            // Escrever so enquanto ha pergunta aberta. Ver o comentario do campo.
            pedido is not null);
    }

    /// <summary>
    /// Devolve o relato a quem o escreveu, pedindo informacao — em vez de encerrar.
    ///
    /// <para><b>E a diferenca entre dois casos que chegavam iguais.</b> "Nao
    /// reproduzi" e "nao vamos fazer" sao decisoes opostas, e chegando iguais do
    /// outro lado a pessoa entende que acabou e para de responder. O relato morre
    /// por ruido — que e o problema que este produto existe para resolver.</para>
    ///
    /// <para><b>A pergunta e um comentario publico</b>, e nao um campo desta
    /// tabela: a conversa acontece pelo proprio relato, e guardar o texto em dois
    /// lugares criaria duas copias para divergirem.</para>
    /// </summary>
    public async Task<ReportDetailViewModel> AskInfoAsync(Guid projectPublicId, Guid reportPublicId, AskInfoDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
            ?? throw new KeyNotFoundException("Relato nao encontrado.");

        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);

        if (!(regras?.InfoRequestEnabled ?? CycleSettingsDefaults.InfoRequestEnabled))
            throw new ForbiddenException("Este projeto nao devolve relato pedindo informacao.");

        // **A escolha de quem escreveu manda aqui.** Sem um sim, nao se abre pedido:
        // prometer resposta a quem nao vai responder deixa o relato pendurado
        // esperando, e encerrar por "sem retorno" quem nunca aceitou responder seria
        // cobrar uma promessa que ninguem fez.
        if (report.AcceptsQuestions != true)
            throw new ForbiddenException(report.AcceptsQuestions is false
                ? "Quem escreveu este relato nao aceitou responder duvidas."
                : "Este relato entrou antes de existir a pergunta sobre responder duvidas.");

        var fechamento = await _unitOfWork.ReportClosures.FindCurrentAsync(report.Id, cancellationToken);

        if (fechamento is not null)
            throw new ConflictException("Este relato ja esta encerrado.");

        var aberto = await _unitOfWork.ReportInfoRequests.FindOpenAsync(report.Id, cancellationToken);

        if (aberto is not null)
            throw new ConflictException("Ja ha um pedido de informacao aberto neste relato.");

        var texto = (dto.Body ?? string.Empty).Trim();

        if (texto.Length == 0)
            throw new ArgumentException("Escreva o que falta. Dizer que falta algo, sem dizer o que, devolve o problema para quem ja nao sabia o que dizer.");

        if (texto.Length > ReportPublicComment.MaxBodyLength)
            throw new ArgumentException($"O texto pode ter ate {ReportPublicComment.MaxBodyLength} caracteres.");

        var agora = DateTime.UtcNow;
        var aviso = regras?.InfoRequestWarnDays ?? CycleSettingsDefaults.InfoRequestWarnDays;
        var encerra = regras?.InfoRequestCloseDays ?? CycleSettingsDefaults.InfoRequestCloseDays;

        // **Aqui o autor e obrigatorio**, ao contrario do encerramento: o sistema
        // encerra sozinho quando um prazo vence, mas nunca pergunta sozinho. Sem
        // usuario identificado a recusa e limpa, e nao um erro de referencia nula
        // depois de o comentario ja estar na fila para gravar.
        var autor = _accountContext.UserId is long userId
            ? await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken)
            : null;

        if (autor is null)
            throw new ForbiddenException("So alguem identificado pode pedir informacao a quem relatou.");

        await _unitOfWork.ReportPublicComments.AddAsync(new ReportPublicComment
        {
            ReportId = report.Id,
            UserId = autor.Id,
            Body = texto,
        }, cancellationToken);

        var pedido = new ReportInfoRequest
        {
            ReportId = report.Id,
            AskedByUserId = autor.Id,
            AskedByUser = autor,
            AskedAt = agora,
            // **Os dois prazos sao gravados, e nao lidos depois.** Mudar a
            // configuracao do projeto nao pode mover o prazo de um pedido que ja
            // esta correndo: quem foi avisado de uma data precisa continuar tendo
            // aquela data.
            WarnAt = agora.AddDays(aviso),
            CloseAt = agora.AddDays(aviso + encerra),
        };

        await _unitOfWork.ReportInfoRequests.AddAsync(pedido, cancellationToken);

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = report.Id,
            UserId = autor.Id,
            Type = EventTypeEnum.ReportInfoRequested,
            Source = EventSourceEnum.Panel,
            // O texto do pedido nao vai junto: ele e comentario, e esta tabela nao
            // se consegue limpar. Vao os prazos, que e o que a contagem quer.
            Payload = JsonSerializer.Serialize(new
            {
                warn_days = aviso,
                close_days = encerra,
            }),
        }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        // Depois da gravacao, e engolindo a falha: o prazo esta na linha do pedido,
        // e a subida da aplicacao reencontra o que venceu sem ter sido fechado.
        try
        {
            await _scheduler.ScheduleAsync(
                DelayedCheckKind.InfoRequest, report.PublicId,
                pedido.CloseAt - agora, cancellationToken);
        }
        catch (Exception)
        {
            // Ver o paragrafo acima.
        }

        return Detail(report, null, InfoRequestOf(pedido), canAskInfo: false);
    }

    public async Task<PublicReportViewModel> ReplyAsync(ReplyToReportDto dto, CancellationToken cancellationToken = default)
    {
        var report = await RequireTrackedReportAsync(dto.TrackingCode, dto.Token, cancellationToken);

        // **So enquanto ha pergunta aberta.** Sem isto, a rota viraria uma caixa de
        // entrada sem dono e sem moderacao — e moderacao ficou de fora desta etapa
        // de proposito.
        var pedido = await _unitOfWork.ReportInfoRequests
            .FindOpenWithoutSessionAsync(report.Id, cancellationToken)
            ?? throw new ConflictException("Nao ha nenhuma pergunta aberta neste relato.");

        var texto = (dto.Body ?? string.Empty).Trim();

        if (texto.Length == 0)
            throw new ArgumentException("Escreva a sua resposta.");

        if (texto.Length > ReportPublicComment.MaxBodyLength)
            throw new ArgumentException($"A resposta pode ter ate {ReportPublicComment.MaxBodyLength} caracteres.");

        await _unitOfWork.ReportPublicComments.AddAsync(new ReportPublicComment
        {
            ReportId = report.Id,
            // Nulo: quem escreveu nao tem usuario aqui, e inventar um seria criar
            // identidade para alguem que nunca se cadastrou.
            UserId = null,
            Body = texto,
        }, cancellationToken);

        pedido.AnsweredAt = DateTime.UtcNow;
        _unitOfWork.ReportInfoRequests.Update(pedido);

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = report.AccountId,
            ProjectId = report.ProjectId,
            ReportId = report.Id,
            Type = EventTypeEnum.ReportReplied,
            Source = EventSourceEnum.PublicPage,
            Payload = JsonSerializer.Serialize(new { body_length = texto.Length }),
        }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        // **A mensagem agendada nao e cancelada**, e nao precisa: ao chegar, ela nao
        // vai encontrar pedido aberto e se descarta. A mesma propriedade da espera.
        return await BuildPublicAsync(report, cancellationToken);
    }

    public async Task ExpireInfoRequestAsync(Guid reportPublicId, CancellationToken cancellationToken = default)
    {
        var report = await _unitOfWork.Reports
            .FindByPublicIdWithoutSessionAsync(reportPublicId, cancellationToken);

        if (report is null)
            return;

        // **Sem pedido aberto: respondido, ou ja vencido.** E o caminho da mensagem
        // duplicada e o da resposta que chegou antes do prazo, e os dois saem em
        // silencio de proposito.
        var pedido = await _unitOfWork.ReportInfoRequests
            .FindOpenWithoutSessionAsync(report.Id, cancellationToken);

        if (pedido is null)
            return;

        if (pedido.CloseAt > DateTime.UtcNow)
        {
            // **Chegou cedo: remarca para o que falta.** Ao contrario da espera, o
            // prazo do pedido nunca e reescrito — entao uma data no futuro aqui nao
            // quer dizer "foi desfeito", quer dizer "ainda nao". Sair em silencio
            // deixaria o pedido sem ninguem para fecha-lo ate a proxima subida.
            //
            // Isto acontece porque o cabecalho de atraso do RabbitMQ carrega
            // milissegundos num inteiro de 32 bits: cerca de 24 dias. A espera cabe
            // folgado no teto de uma semana; o pedido, cujos dois prazos vao a 365
            // dias cada, nao cabe — e ai o agendamento chega no teto e remarca, tantas
            // vezes quantas forem precisas.
            try
            {
                await _scheduler.ScheduleAsync(
                    DelayedCheckKind.InfoRequest, report.PublicId,
                    pedido.CloseAt - DateTime.UtcNow, cancellationToken);
            }
            catch (Exception)
            {
                // Engolida como as outras: o prazo esta gravado, e a subida reencontra
                // o que venceu sem ter sido fechado.
            }

            return;
        }

        var agora = DateTime.UtcNow;
        pedido.ExpiredAt = agora;
        _unitOfWork.ReportInfoRequests.Update(pedido);

        // Encerrado por outro caminho enquanto o prazo corria: o pedido para de
        // esperar, e nao se encerra o que ja esta encerrado.
        var fechamento = await _unitOfWork.ReportClosures
            .FindCurrentWithoutSessionAsync(report.Id, cancellationToken);

        if (fechamento is not null)
        {
            await _unitOfWork.CommitAsync(cancellationToken);
            return;
        }

        var dias = (int)Math.Round((pedido.CloseAt - pedido.AskedAt).TotalDays);

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = report.AccountId,
            ProjectId = report.ProjectId,
            ReportId = report.Id,
            Type = EventTypeEnum.ReportClosed,
            // Nao foi o painel: foi um prazo vencendo, sem clique de ninguem.
            Source = EventSourceEnum.System,
            Payload = JsonSerializer.Serialize(new
            {
                outcome = PublicOutcomeEnum.NoAnswer.ToString(),
                from_info_request = true,
            }),
        }, cancellationToken);

        await _unitOfWork.ReportClosures.AddAsync(new ReportClosure
        {
            ReportId = report.Id,
            Outcome = PublicOutcomeEnum.NoAnswer,
            // **O unico motivo que o sistema escreve.** Ele diz o que aconteceu e o
            // que ainda da para fazer: encerrado assim continua reabrivel, e quem
            // nao respondeu em duas semanas pode voltar no mes seguinte.
            Reason = $"A equipe pediu uma informacao e ficou {dias} dias sem resposta, entao este relato foi encerrado automaticamente. Se ainda estiver acontecendo, voce pode reabrir por esta pagina.",
            // Nulo quer dizer que foi o sistema. E aqui foi.
            ClosedByUserId = null,
            ClosedAt = agora,
            // Sem espera: este fechamento nao veio de um movimento, e nao ha engano
            // a desfazer — o prazo venceu, e a pessoa precisa saber disso agora.
            PublicAt = agora,
        }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);
    }

    public Task<IReadOnlyList<Guid>> ListOverdueInfoRequestsAsync(CancellationToken cancellationToken = default)
        => _unitOfWork.ReportInfoRequests.ListOverdueWithoutSessionAsync(DateTime.UtcNow, cancellationToken);

    private static ReportInfoRequestViewModel? InfoRequestOf(ReportInfoRequest? request)
        => request is null
            ? null
            : new ReportInfoRequestViewModel(
                request.AskedByUser?.Name, request.AskedAt, request.WarnAt, request.CloseAt);

    public async Task<ReportPageViewModel> ListAsync(Guid projectPublicId, int page, int pageSize, string? state, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var filter = await ResolveStateFilterAsync(project.Id, state, cancellationToken);

        var size = Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaxPageSize);
        var current = Math.Max(page, 1);

        var total = await _unitOfWork.Reports.CountByProjectAsync(project.Id, filter, cancellationToken);

        // Em long porque o produto estoura o int muito antes de estourar a tabela:
        // pagina 200 milhoes vezes 20 nao existe como pergunta, mas chega como
        // numero, e em int ele volta negativo e a consulta quebra em vez de
        // responder "acabou".
        var skip = (long)(current - 1) * size;

        if (skip >= total)
            return new ReportPageViewModel([], total);

        var reports = await _unitOfWork.Reports.ListByProjectAsync(project.Id, filter, (int)skip, size, cancellationToken);

        return new ReportPageViewModel(reports.Select(Map).ToList(), total);
    }

    /// <summary>
    /// Resolve o projeto pela chave publica apresentada.
    ///
    /// <para>Chave ausente, desconhecida, revogada ou secreta recebem <b>a mesma</b>
    /// recusa, com a mesma mensagem: responder "esta chave existe mas foi revogada"
    /// contaria a quem tenta que ele acertou metade.</para>
    /// </summary>
    /// <summary>
    /// Move o relato de coluna, gravando quem moveu e para onde.
    ///
    /// <para><b>A ordem das duas gravacoes e a regra mais importante deste
    /// metodo.</b> O evento entra primeiro e a coluna do relato depois, no mesmo
    /// <c>CommitAsync</c>: ou os dois entram, ou nenhum. Escrever a coluna antes
    /// e o evento depois pareceria igual em todo teste feliz, e perderia o dado da
    /// pesquisa exatamente nos casos em que ele mais importa — os de falha.</para>
    /// </summary>
    public async Task<ReportSummaryViewModel> MoveAsync(Guid projectPublicId, Guid reportPublicId, MoveReportDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
            ?? throw new KeyNotFoundException("Relato nao encontrado.");

        if (dto.StatePublicId is null)
            throw new ArgumentException("Informe a coluna de destino.");

        var destino = await _unitOfWork.ProjectStates.GetByPublicIdAsync(dto.StatePublicId.Value, cancellationToken);

        if (destino is null || destino.ProjectId != project.Id)
            throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

        if (!destino.IsActive)
            throw new ConflictException("Este estado esta aposentado e nao recebe relato novo.");

        // Mover para onde ja esta nao e erro, e so nao ter o que fazer. Gravar
        // assim mesmo encheria o historico de linhas que nao dizem nada, e a
        // contagem da pesquisa passaria a medir cliques em vez de movimentos.
        if (report.ProjectStateId == destino.Id)
            return Map(report);

        // **A conferencia do encerramento vem antes de qualquer gravacao.** Ela nao
        // depende da traducao — quem encerra e a coluna de dentro, e nao a etapa
        // publica —, entao nao ha motivo para o relato andar meio caminho e so
        // entao esbarrar num campo em branco.
        // **Nem todo projeto encerra movendo.** Quem escolheu o botao nao tem coluna
        // que encerre: ali o movimento e so movimento, e pedir motivo nele seria
        // cobrar por uma decisao que ninguem tomou.
        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);
        var gatilho = regras?.ClosureTrigger ?? CycleSettingsDefaults.ClosureTrigger;

        var ultimaAtiva = gatilho == ClosureTriggerEnum.LastColumn
            ? await _unitOfWork.ProjectStates.LastActiveAsync(project.Id, cancellationToken)
            : null;

        var encerra = ultimaAtiva is not null && ultimaAtiva.Id == destino.Id;
        var motivo = (dto.Reason ?? string.Empty).Trim();

        if (encerra)
        {
            if (dto.Outcome is null)
                throw new ArgumentException("Informe o desfecho do relato.");

            // **Impossivel, e nao desencorajado.** Sem o motivo o produto reproduz
            // exatamente o que existe para resolver: a pessoa fica sabendo que
            // acabou, e nao o que aconteceu.
            if (motivo.Length == 0)
                throw new ArgumentException("Escreva por que o relato esta sendo encerrado. E o que quem relatou vai ler.");

            if (motivo.Length > ReportClosure.MaxReasonLength)
                throw new ArgumentException($"O motivo pode ter ate {ReportClosure.MaxReasonLength} caracteres.");
        }
        else if (dto.Outcome is not null || motivo.Length > 0)
        {
            // Recusado, e nao ignorado em silencio: um desfecho aceito num movimento
            // que nao encerra nada seria gravado sem ter onde morar, e quem mandou
            // continuaria achando que encerrou.
            throw new ArgumentException("Este movimento nao encerra o relato, entao ele nao leva desfecho nem motivo.");
        }

        var origem = report.ProjectState;

        // O EVENTO PRIMEIRO. Ver o comentario do metodo: esta ordem e a regra.
        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = report.Id,
            UserId = _accountContext.UserId,
            Type = EventTypeEnum.ReportStateChanged,
            Source = EventSourceEnum.Panel,
            // Os nomes vao junto dos identificadores de proposito: renomear uma
            // coluna nao pode reescrever o passado dizendo que o relato esteve num
            // estado que ainda nao existia. O identificador serve para reconstruir
            // o caminho; o nome, para le-lo.
            Payload = JsonSerializer.Serialize(new
            {
                from_id = origem?.PublicId,
                from_name = origem?.Name,
                to_id = destino.PublicId,
                to_name = destino.Name,
            }),
        }, cancellationToken);

        // E o cache depois.
        report.ProjectStateId = destino.Id;
        report.ProjectState = destino;
        _unitOfWork.Reports.Update(report);

        // **A espera decide se a jornada anda agora ou depois.** Zero e o
        // comportamento de sempre: a traducao acontece junto do movimento. Acima de
        // zero, o lado de fora nao muda nada aqui — so fica marcada a hora de olhar
        // de novo, e a janela ate la e o que permite desfazer um movimento errado
        // antes de a pessoa ver.
        var espera = regras?.PublicDelayMinutes ?? CycleSettingsDefaults.PublicDelayMinutes;

        if (espera <= 0)
        {
            // So entao a traducao: ela e **consequencia** do movimento, e nao parte
            // da decisao de mover. Se ela viesse antes, um projeto sem jornada
            // poderia acabar impedindo o time de trabalhar — e a camada publica
            // existe para servir quem esta de fora, nao para mandar em quem esta
            // dentro.
            var mapaAtual = await _unitOfWork.ProjectStatusMappings
                .ListByVersionAsync(project.Id, project.MappingVersion, cancellationToken);
            var etapasAtuais = await _unitOfWork.ProjectPublicStages
                .ListByProjectAsync(project.Id, cancellationToken);

            await ApplyPublicStageAsync(
                project, report, destino.Id, EventSourceEnum.Panel, _accountContext.UserId,
                mapaAtual, etapasAtuais, cancellationToken);

            // Um movimento anterior podia estar esperando. Ele deixa de valer: o
            // relato acabou de andar, e o que a fila fosse aplicar ja aconteceu.
            report.PublicStageDueAt = null;
        }
        else
        {
            // **Reescrever a data e o que faz o desfazer funcionar.** A mensagem
            // antiga continua a caminho e nao se cancela; ao chegar, ela encontra um
            // vencimento no futuro e se descarta sozinha.
            report.PublicStageDueAt = DateTime.UtcNow.AddMinutes(espera);
        }

        // E o encerramento por ultimo, na mesma gravacao. **Ele nao e consequencia
        // da traducao**: um projeto sem jornada continua encerrando relato, e o
        // motivo continua chegando a quem relatou pela pagina de acompanhamento. A
        // ordem aqui e so de leitura — tudo isto entra ou nao entra junto.
        if (encerra)
        {
            // **A espera vale para o fechamento, e nao so para a jornada.** Segurar
            // o passo e deixar o motivo escapar seria a pior das duas metades: o
            // texto do encerramento e justamente o que a pessoa le primeiro.
            await RegisterClosureAsync(
                project, report, dto.Outcome!.Value, motivo,
                report.PublicStageDueAt ?? DateTime.UtcNow, cancellationToken);
        }
        else if (gatilho == ClosureTriggerEnum.LastColumn)
        {
            // **Sair da coluna que encerra desfaz o encerramento**, e so neste
            // gatilho. Sem isto, desfazer um movimento errado devolvia o relato para
            // a fila e o deixava encerrado — a pessoa continuava lendo "acabou"
            // sobre um relato que o time voltou a trabalhar.
            //
            // No gatilho por botao nao se faz nada: la o fechamento nasceu de uma
            // decisao propria, e mover o relato e so mover.
            await CancelClosureAsync(project, report, cancellationToken);
        }

        await _unitOfWork.CommitAsync(cancellationToken);

        // **Depois da gravacao, sempre.** O vencimento esta numa coluna do relato;
        // publicar antes do commit deixaria quem consome chegar antes de a linha
        // existir e descartar um agendamento de verdade.
        //
        // E a falha aqui **nao derruba o movimento**: o relato ja andou e o
        // vencimento ja esta gravado. Sem a mensagem, ele espera a proxima subida da
        // aplicacao, que reencontra o que venceu. Perder o agendamento atrasa; nao
        // corrompe — e derrubar a requisicao faria o time perder um movimento que ja
        // aconteceu por causa de um broker fora do ar.
        if (report.PublicStageDueAt is DateTime vencimento)
        {
            try
            {
                await _scheduler.ScheduleAsync(
                    DelayedCheckKind.PublicStage, report.PublicId,
                    vencimento - DateTime.UtcNow, cancellationToken);
            }
            catch (Exception)
            {
                // Engolida de proposito. Ver o paragrafo acima.
            }
        }

        return Map(report);
    }

    /// <summary>
    /// Encerra o relato por um botao, e nao por um movimento.
    ///
    /// <para><b>A rota existe nos dois gatilhos, e isso e decisao.</b> A
    /// configuracao diz por qual gesto o painel <b>oferece</b> encerrar; ela nao
    /// tira do time o direito de encerrar. Sem isto, o relato que ja estava parado
    /// na ultima coluna antes de a regra existir nao teria como ser encerrado
    /// nunca — mover para onde ele ja esta nao e movimento.</para>
    ///
    /// <para><b>Nao move o relato.</b> O botao existe justamente para o time cuja
    /// ultima coluna nao quer dizer "acabou" — "Aguardando deploy", "Arquivado".
    /// Arrastar o relato para outro lugar por causa do encerramento desarrumaria a
    /// fila de quem escolheu esta opcao para nao ter de arrumar a fila.</para>
    /// </summary>
    public async Task<ReportDetailViewModel> CloseAsync(Guid projectPublicId, Guid reportPublicId, CloseReportDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
            ?? throw new KeyNotFoundException("Relato nao encontrado.");

        // Encerrar duas vezes nao e engano de digitacao: e a segunda aba, ou o
        // segundo clique. Recusar mantem uma linha por fechamento, que e o que faz
        // a sequencia "fechou, reabriu, fechou de novo" contar a historia certa.
        var aberto = await _unitOfWork.ReportClosures.FindCurrentAsync(report.Id, cancellationToken);

        if (aberto is not null)
            throw new ConflictException("Este relato ja esta encerrado.");

        if (dto.Outcome is null)
            throw new ArgumentException("Informe o desfecho do relato.");

        var motivo = (dto.Reason ?? string.Empty).Trim();

        if (motivo.Length == 0)
            throw new ArgumentException("Escreva por que o relato esta sendo encerrado. E o que quem relatou vai ler.");

        if (motivo.Length > ReportClosure.MaxReasonLength)
            throw new ArgumentException($"O motivo pode ter ate {ReportClosure.MaxReasonLength} caracteres.");

        // **O botao nao espera.** A janela existe para desfazer um movimento feito
        // por engano — arrastar para a coluna errada. Aqui houve um dialogo, um
        // desfecho escolhido e um motivo escrito: nao ha engano a desfazer.
        var fechamento = await RegisterClosureAsync(
            project, report, dto.Outcome.Value, motivo, DateTime.UtcNow, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        // **Sem gravar leitura.** Esta resposta e a mesma forma do detalhe porque a
        // tela ja esta com o relato aberto e so precisa dele atualizado; passar
        // por `GetAsync` registraria uma segunda visualizacao que ninguem fez.
        // Encerrado: nao ha mais o que perguntar, e um pedido aberto deixou de
        // fazer sentido — mas quem o fecha e o prazo dele, nao este caminho.
        return Detail(report, ClosureOf(fechamento), null, canAskInfo: false);
    }

    /// <summary>
    /// Grava o fechamento e o evento que o acompanha, sem confirmar nada.
    ///
    /// <para><b>Nao chama <c>CommitAsync</c> de proposito.</b> Os dois chamadores
    /// gravam mais coisas junto — o movimento grava o evento interno e a jornada —,
    /// e confirmar aqui partiria em duas transacoes o que precisa entrar ou nao
    /// entrar junto.</para>
    /// </summary>
    private async Task<ReportClosure> RegisterClosureAsync(
        Project project,
        Report report,
        PublicOutcomeEnum outcome,
        string reason,
        DateTime publicAt,
        CancellationToken cancellationToken)
    {
        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = report.Id,
            UserId = _accountContext.UserId,
            Type = EventTypeEnum.ReportClosed,
            Source = EventSourceEnum.Panel,
            // **O motivo nao vai no payload**, pela mesma razao que o texto do
            // comentario nao vai: esta tabela so cresce e nunca e apagada, e copiar
            // para ca um texto escrito por uma pessoa criaria uma segunda copia dele
            // onde nao se consegue limpar. Vai o desfecho, que e o que a contagem
            // precisa, e o tamanho, que diz se houve motivo de verdade ou um ponto
            // final para passar da tela.
            Payload = JsonSerializer.Serialize(new
            {
                outcome = outcome.ToString(),
                reason_length = reason.Length,
            }),
        }, cancellationToken);

        // O autor vem do banco porque a sessao guarda o identificador e nao o nome,
        // e a resposta desta acao precisa do nome: a tela ja esta aberta e nao pode
        // buscar o detalhe de novo — buscar **grava** um evento de leitura.
        var autor = _accountContext.UserId is long userId
            ? await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken)
            : null;

        var fechamento = new ReportClosure
        {
            ReportId = report.Id,
            Outcome = outcome,
            Reason = reason,
            // Nulo aqui quer dizer que foi o sistema. Vindo do painel ha sempre
            // alguem logado, entao nulo neste caminho seria sessao sem usuario — e
            // ai o certo e gravar o que se sabe, que e nada.
            ClosedByUserId = autor?.Id,
            ClosedByUser = autor,
            ClosedAt = DateTime.UtcNow,
            // **A espera vale para o fechamento tambem.** Gravar aqui, e nao
            // calcular na leitura, e o que faz mexer na configuracao depois nao
            // reescrever o passado deste fechamento.
            PublicAt = publicAt,
        };

        await _unitOfWork.ReportClosures.AddAsync(fechamento, cancellationToken);

        return fechamento;
    }

    /// <summary>
    /// Desfaz um encerramento que veio de um movimento, quando o relato sai da
    /// coluna que encerra.
    ///
    /// <para><b>Apaga logicamente, e grava um evento.</b> A linha fica para quem
    /// for investigar, mas para de ser o fim do relato — e o evento existe porque
    /// sem ele o historico diria "encerrado" e nunca diria que deixou de ser, sobre
    /// um relato que voltou a andar.</para>
    ///
    /// <para><b>Fechamento ja confirmado nao se desfaz.</b> Ali quem relatou
    /// respondeu, e a resposta dela e o dado que o produto existe para colher —
    /// apaga-la porque o time mexeu na fila depois seria perder o que ela disse. O
    /// relato volta a andar e a linha antiga continua contando o que aconteceu.</para>
    /// </summary>
    private async Task CancelClosureAsync(Project project, Report report, CancellationToken cancellationToken)
    {
        var fechamento = await _unitOfWork.ReportClosures.FindCurrentAsync(report.Id, cancellationToken);

        if (fechamento is null || fechamento.ConfirmedAt is not null)
            return;

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = report.Id,
            UserId = _accountContext.UserId,
            Type = EventTypeEnum.ReportClosureCancelled,
            Source = EventSourceEnum.Panel,
            Payload = JsonSerializer.Serialize(new
            {
                outcome = fechamento.Outcome.ToString(),
                // Se a pessoa chegou a ver, ou se o desfazer coube na janela. E a
                // diferenca entre corrigir um engano e mudar de ideia em publico.
                was_public = fechamento.PublicAt <= DateTime.UtcNow,
            }),
        }, cancellationToken);

        await _unitOfWork.ReportClosures.SoftDeleteAsync(fechamento, cancellationToken);
    }

    /// <summary>
    /// O fechamento como o painel o le, ou nulo quando nao ha.
    ///
    /// </summary>
    private static ReportClosureViewModel? ClosureOf(ReportClosure? closure)
        => closure is null
            ? null
            : new ReportClosureViewModel(
                closure.Outcome,
                closure.Reason,
                closure.ClosedAt,
                closure.ClosedByUser?.Name,
                closure.ConfirmedAt,
                closure.Satisfaction,
                closure.SatisfactionDeclined);

    public async Task ApplyScheduledPublicStageAsync(Guid reportPublicId, CancellationToken cancellationToken = default)
    {
        var report = await _unitOfWork.Reports
            .FindByPublicIdWithoutSessionAsync(reportPublicId, cancellationToken);

        // Relato que sumiu: nada a fazer, e nao e erro. A mensagem sobreviveu a ele.
        if (report is null)
            return;

        // **Sem agendamento: ja foi aplicado, ou o movimento foi desfeito.** E o
        // caminho da mensagem duplicada, e ele sai em silencio de proposito.
        if (report.PublicStageDueAt is not DateTime vencimento)
            return;

        // **Vencimento no futuro: esta chamada e de um agendamento que foi
        // reescrito.** O time moveu de novo dentro da janela, e a data mudou. E
        // exatamente aqui que o desfazer acontece — sem cancelar mensagem nenhuma.
        if (vencimento > DateTime.UtcNow)
            return;

        // Sem coluna nao ha o que traduzir. Limpa o agendamento: deixa-lo vencido
        // faria a recuperacao da subida tentar isto para sempre.
        if (report.ProjectStateId is not long estadoAtual)
        {
            report.PublicStageDueAt = null;
            _unitOfWork.Reports.Update(report);
            await _unitOfWork.CommitAsync(cancellationToken);
            return;
        }

        var project = report.Project;

        // **O mapa de agora, e o estado de agora.** Guardar qualquer um dos dois no
        // agendamento congelaria no passado uma resposta que so vale neste instante.
        var mapa = await _unitOfWork.ProjectStatusMappings
            .ListByVersionWithoutSessionAsync(project.Id, project.MappingVersion, cancellationToken);
        var etapas = await _unitOfWork.ProjectPublicStages
            .ListByProjectWithoutSessionAsync(project.Id, cancellationToken);

        // Sem usuario **e com origem `System`**: ver o comentario da interface. O
        // passo aconteceu porque um prazo venceu, e nao porque alguem clicou agora —
        // chamar isto de painel faria a contagem atribuir ao time uma acao que o
        // time nao tomou.
        await ApplyPublicStageAsync(
            project, report, estadoAtual, EventSourceEnum.System, null,
            mapa, etapas, cancellationToken);

        report.PublicStageDueAt = null;
        _unitOfWork.Reports.Update(report);

        await _unitOfWork.CommitAsync(cancellationToken);
    }

    public Task<IReadOnlyList<Guid>> ListOverdueScheduledAsync(CancellationToken cancellationToken = default)
        => _unitOfWork.Reports.ListOverduePublicStageWithoutSessionAsync(DateTime.UtcNow, cancellationToken);

    public async Task<IReadOnlyList<ReportHistoryEntryViewModel>> HistoryAsync(Guid projectPublicId, Guid reportPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
            ?? throw new KeyNotFoundException("Relato nao encontrado.");

        var events = await _unitOfWork.Events.ListByReportAsync(report.Id, cancellationToken);

        return events.Select(entity =>
        {
            var (de, para) = StateNames(entity);

            return new ReportHistoryEntryViewModel(
                entity.PublicId,
                entity.Type,
                entity.User?.Name,
                de,
                para,
                entity.OccurredAt);
        }).ToList();
    }

    /// <summary>
    /// Os nomes das colunas guardados no evento de mudanca de estado.
    ///
    /// <para><b>Le o payload com tolerancia de proposito.</b> A tabela so cresce e
    /// guarda eventos de versoes antigas do sistema: um payload com outro formato,
    /// ou sem formato nenhum, e uma possibilidade real — e nesse caso a linha
    /// aparece sem os nomes, em vez de derrubar o historico inteiro.</para>
    /// </summary>
    private static (string? From, string? To) StateNames(Event entity)
    {
        if (entity.Type != EventTypeEnum.ReportStateChanged || string.IsNullOrWhiteSpace(entity.Payload))
            return (null, null);

        try
        {
            using var documento = JsonDocument.Parse(entity.Payload);
            var raiz = documento.RootElement;

            return (Texto(raiz, "from_name"), Texto(raiz, "to_name"));
        }
        catch (JsonException)
        {
            return (null, null);
        }

        static string? Texto(JsonElement raiz, string nome)
            => raiz.TryGetProperty(nome, out var valor) && valor.ValueKind == JsonValueKind.String
                ? valor.GetString()
                : null;
    }

    /// <summary>
    /// Monta a jornada que quem relatou ve.
    ///
    /// <para><b>Campo a campo, e nunca serializando a entidade.</b> E o ponto mais
    /// delicado do sistema: esta e a unica resposta que sai para alguem de fora do
    /// time do cliente. Com serializacao, a coluna acrescentada amanha a
    /// <c>project_public_stages</c> apareceria aqui sem ninguem decidir — e
    /// vazamento por serializacao nao da erro em teste nenhum.</para>
    ///
    /// <para><b>Por onde passou vem dos eventos, e nao da posicao.</b> Um relato
    /// pode pular etapas — basta o estado interno apontar direto para o quarto
    /// passo —, e marcar como percorrido tudo que esta antes seria contar uma
    /// historia que nao aconteceu. A consulta traz <b>so</b> os eventos de mudanca
    /// de etapa publica, e o recorte mora nela: tipo de evento novo nasce invisivel
    /// para fora.</para>
    ///
    /// <para>As duas leituras desligam o filtro global, porque aqui nao ha sessao.
    /// Quem chegou ate aqui ja provou que pode ver este relato, pelo token do
    /// link.</para>
    /// </summary>
    private async Task<IReadOnlyList<PublicStageViewModel>> BuildJourneyAsync(Report report, CancellationToken cancellationToken)
    {
        var etapas = await _unitOfWork.ProjectPublicStages
            .ListByProjectWithoutSessionAsync(report.ProjectId, cancellationToken);

        // Projeto sem jornada devolve lista vazia, e a pagina diz isso em vez de
        // prometer. Sair daqui antes evita a consulta de eventos, que nao teria em
        // que passo se apoiar.
        if (etapas.Count == 0)
            return [];

        var eventos = await _unitOfWork.Events
            .ListPublicStageChangesWithoutSessionAsync(report.Id, cancellationToken);

        // A primeira vez em que cada etapa foi alcancada. Relato que voltou para uma
        // etapa — pelas que permitem retorno — guarda a chegada original: e ela que
        // conta desde quando o assunto esta naquele ponto.
        var chegadaPorEtapa = new Dictionary<Guid, DateTime>();

        foreach (var evento in eventos)
        {
            var destino = PublicStageTarget(evento);

            if (destino is Guid etapaId && !chegadaPorEtapa.ContainsKey(etapaId))
                chegadaPorEtapa[etapaId] = evento.OccurredAt;
        }

        return etapas
            .Select(etapa => new PublicStageViewModel(
                etapa.Label,
                etapa.Description,
                etapa.NextStep,
                chegadaPorEtapa.TryGetValue(etapa.PublicId, out var chegada) ? chegada : null,
                etapa.Id == report.ProjectPublicStageId))
            .ToList();
    }

    /// <summary>
    /// O identificador da etapa de destino dentro do payload de um evento.
    ///
    /// <para>Tolerante de proposito, como a leitura do historico interno: payload e
    /// campo livre, e evento antigo pode ter sido gravado com outro formato. Uma
    /// excecao aqui derrubaria a pagina inteira de quem so queria ver o andamento —
    /// melhor um passo sem data do que uma tela que nao abre.</para>
    /// </summary>
    private static Guid? PublicStageTarget(Event evento)
    {
        if (string.IsNullOrWhiteSpace(evento.Payload))
            return null;

        try
        {
            using var documento = JsonDocument.Parse(evento.Payload);

            return documento.RootElement.TryGetProperty("to_id", out var valor)
                   && valor.TryGetGuid(out var id)
                ? id
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Pergunta ao motor o que a jornada publica faz, e grava o que ele decidiu.
    ///
    /// <para><b>Aqui nao ha regra nenhuma.</b> A decisao inteira mora em
    /// <see cref="StateTranslator"/>, que nao conhece banco nem HTTP e por isso pode
    /// ser exercitada em todo caminho possivel sem nada de pe. Este metodo so traduz
    /// entidade em valor, chama, e escreve o resultado — no dia em que uma condicao
    /// de negocio aparecer neste corpo, ela esta no lugar errado.</para>
    ///
    /// <para><b>Evento primeiro, cache depois</b>, a mesma regra do estado interno e
    /// pelo mesmo motivo: e o evento que alimenta a linha do tempo publica e as
    /// metricas, e se ele falhar com o cache ja gravado o dado se perde para
    /// sempre.</para>
    ///
    /// <para><b>So dois dos quatro desfechos viram evento.</b> "Caiu na mesma etapa"
    /// e "seria retroceder" sao o produto funcionando, e a ausencia de evento
    /// publico ja diz que nada mudou do lado de fora. "Nao mapeado" e outra coisa: e
    /// configuracao faltando, que deixa quem escreveu o relato sem ver movimento — e
    /// quanto tempo isso durou e justamente o que se vai querer medir. Sem o evento,
    /// esse silencio nao deixaria rastro nenhum.</para>
    /// </summary>
    /// <param name="mapa">O mapa da versao que vale. Quem chama escolhe a leitura com ou sem sessao.</param>
    /// <param name="etapas">A jornada do projeto, pela mesma razao.</param>
    private async Task ApplyPublicStageAsync(
        Project project,
        Report report,
        long internalStateId,
        EventSourceEnum source,
        long? userId,
        IReadOnlyList<ProjectStatusMapping> mapa,
        IReadOnlyList<ProjectPublicStage> etapas,
        CancellationToken cancellationToken,
        bool reopening = false)
    {
        var etapaPorId = etapas.ToDictionary(etapa => etapa.Id);

        // Ligacao para etapa que nao existe mais e descartada em vez de quebrar: a
        // remocao de etapa e recusada enquanto algum estado aponta para ela, entao
        // chegar aqui significa que o mapa mudou depois — e o certo e tratar aquele
        // estado como nao mapeado, que e o que ele virou.
        var mapaDoMotor = mapa
            .Where(ligacao => etapaPorId.ContainsKey(ligacao.ProjectPublicStageId))
            .ToDictionary(
                ligacao => ligacao.ProjectStateId,
                ligacao => Referencia(etapaPorId[ligacao.ProjectPublicStageId]));

        // A etapa de agora vira nula quando ela foi removida da jornada. O motor
        // entao trata o relato como quem ainda nao apareceu, e ele volta a entrar —
        // melhor do que ficar preso apontando para um passo que sumiu.
        var atual = report.ProjectPublicStageId is long atualId && etapaPorId.TryGetValue(atualId, out var etapaAtual)
            ? Referencia(etapaAtual)
            : (PublicStageRef?)null;

        // **A bandeira escolhe qual funcao pura chamar, e nao afrouxa nenhuma
        // regra.** Reabrir e outra pergunta: la a regressao nao existe como
        // conceito, porque quem pediu o retorno foi a propria pessoa que espera.
        // Um parametro dentro do motor convidaria a passar "forca" num movimento
        // comum, e a regra de regressao viraria opcional por descuido.
        var decisao = reopening
            ? StateTranslator.TranslateReopen(internalStateId, mapaDoMotor, atual)
            : StateTranslator.Translate(internalStateId, mapaDoMotor, atual);

        if (decisao.Outcome is TranslationOutcomeEnum.SameStage or TranslationOutcomeEnum.RegressionHeld)
            return;

        if (decisao.Outcome == TranslationOutcomeEnum.Unmapped)
        {
            await _unitOfWork.Events.AddAsync(new Event
            {
                AccountId = project.AccountId,
                ProjectId = project.Id,
                Report = report,
                UserId = userId,
                Type = EventTypeEnum.ReportPublicStageUnmapped,
                Source = source,
                // O nome do estado interno **nao** vai junto. Este evento e o unico
                // que nasce de uma falta, e a tentacao de explicar qual estado ficou
                // de fora poria o vocabulario de dentro numa tabela que alimenta a
                // linha do tempo publica. Quem precisa do nome tem o evento interno,
                // gravado no mesmo instante.
                Payload = JsonSerializer.Serialize(new { mapping_version = project.MappingVersion }),
            }, cancellationToken);

            return;
        }

        var destino = decisao.Stage!.Value;
        var etapaDestino = etapaPorId[destino.Id];
        var etapaOrigem = atual is PublicStageRef origem ? etapaPorId[origem.Id] : null;

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            Report = report,
            UserId = userId,
            Type = EventTypeEnum.ReportPublicStageChanged,
            Source = source,
            // Os rotulos vao junto dos identificadores, como no evento interno:
            // renomear uma etapa nao pode reescrever o passado. E a versao do mapa
            // vai junto dos dois — sem ela, recontar este movimento amanha usaria o
            // mapa de amanha e devolveria outra historia.
            Payload = JsonSerializer.Serialize(new
            {
                from_id = etapaOrigem?.PublicId,
                from_label = etapaOrigem?.Label,
                to_id = etapaDestino.PublicId,
                to_label = etapaDestino.Label,
                mapping_version = project.MappingVersion,
            }),
        }, cancellationToken);

        report.ProjectPublicStageId = etapaDestino.Id;
        report.ProjectPublicStage = etapaDestino;

        // **Sem `Update` aqui, e isso nao e economia.** Este metodo roda nos dois
        // momentos, e num deles o relato ainda nao existe no banco: quando ele
        // **entra**, a chave dele e provisoria ate o `CommitAsync`, e pedir
        // `Update` sobre uma entidade nesse estado e o proprio EF que recusa —
        // "The property 'Report.Id' has a temporary value". O relato ja esta
        // sendo rastreado nos dois caminhos, entao mexer no campo basta, e
        // `UpdatedAt` continua sendo carimbado na hora de gravar.
    }

    /// <summary>
    /// A etapa reduzida ao que o motor precisa. Rotulo, frase e desfecho ficam de
    /// fora de proposito: nada disso muda uma decisao, e leva-los junto arrastaria a
    /// entidade — e com ela o banco — para dentro do nucleo.
    /// </summary>
    private static PublicStageRef Referencia(ProjectPublicStage etapa)
        => new(etapa.Id, etapa.Position, etapa.AllowsReturn);

    /// <summary>
    /// Em que ponto da fila o relato entra.
    ///
    /// <para>Primeiro a escolha do cliente para aquele tipo; sem escolha, o
    /// primeiro estado ativo da fila. <b>Sem estado nenhum devolve nulo</b>, e o
    /// relato entra sem lugar — recusa-lo seria perder o que veio de fora por uma
    /// configuracao que o cliente nao fez, e quem escreveu nao tem nada a ver com
    /// isso.</para>
    ///
    /// <para>As duas consultas desligam o filtro global: aqui nao ha sessao, e a
    /// conta atual e zero. Sem isso a escolha do cliente voltaria vazia e todo
    /// relato cairia no padrao, sem erro em lugar nenhum.</para>
    ///
    /// <para>O estado escolhido nao precisa ser conferido de novo: aposentar um
    /// estado que e entrada de algum tipo e recusado, entao ele nao tem como estar
    /// aposentado aqui.</para>
    /// </summary>
    private async Task<long?> ResolveLandingStateAsync(long projectId, ReportTypeEnum reportType, CancellationToken cancellationToken)
    {
        var chosen = await _unitOfWork.ProjectInitialStates
            .FindByTypeWithoutSessionAsync(projectId, reportType, cancellationToken);

        if (chosen is not null)
            return chosen.ProjectStateId;

        var first = await _unitOfWork.ProjectStates
            .FirstActiveWithoutSessionAsync(projectId, cancellationToken);

        return first?.Id;
    }

    private async Task<Project> RequireProjectAsync(string? key, CancellationToken cancellationToken)
    {
        var value = (key ?? string.Empty).Trim();

        if (value.Length > 0)
        {
            var found = await _unitOfWork.ProjectKeys.FindActivePublicAsync(value, cancellationToken);
            if (found is not null)
                return found.Project;
        }

        throw new UnauthorizedAccessException("Chave publica invalida.");
    }

    public async Task<ReporterCodeReportsViewModel> ListByReporterCodeAsync(ReporterCodeLookupDto dto, CancellationToken cancellationToken = default)
    {
        var vazia = new ReporterCodeReportsViewModel([], false);

        var project = await RequireProjectAsync(dto.Key, cancellationToken);
        var digitado = (dto.Code ?? string.Empty).Trim().ToUpperInvariant();

        if (digitado.Length == 0)
            return vazia;

        // **Projeto que nao usa o modo responde vazio, e nao uma recusa.** Recusar
        // contaria a configuracao do cliente a quem nem relato tem aqui.
        var identidade = await _unitOfWork.ProjectIdentitySettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        if ((identidade?.Mode ?? IdentitySettingsDefaults.Mode) != ReporterIdentityModeEnum.PersonalCode)
            return vazia;

        var codigo = await _unitOfWork.ReporterCodes
            .FindByCodeWithoutSessionAsync(project.Id, digitado, cancellationToken);

        // **Aqui esta a regra inteira do modo, e ela cabe numa linha:** codigo que
        // nao existe sai igual a codigo sem relato nenhum. Ver a interface.
        if (codigo is null)
            return vazia;

        // **Pede um a mais do que mostra.** E assim que da para dizer "ha mais" sem
        // contar quantos — e contar entregaria a quem sonda o tamanho da lista
        // alheia, que e informacao sobre outra pessoa.
        var encontrados = await _unitOfWork.Reports
            .ListByReporterCodeWithoutSessionAsync(codigo.Id, ReporterCode.MaxListedReports + 1, cancellationToken);

        var temMais = encontrados.Count > ReporterCode.MaxListedReports;
        var relatos = temMais
            ? encontrados.Take(ReporterCode.MaxListedReports).ToList()
            : encontrados;

        // Uma consulta para a lista inteira, e nao uma por linha: o custo da
        // resposta nao pode crescer com o tamanho da lista numa rota publica.
        var fechados = (await _unitOfWork.ReportClosures
                .ListReportIdsWithPublicClosureWithoutSessionAsync(
                    [.. relatos.Select(relato => relato.Id)], DateTime.UtcNow, cancellationToken))
            .ToHashSet();

        return new ReporterCodeReportsViewModel(
            relatos
                .Select(relato => new ReporterCodeReportViewModel(
                    relato.TrackingCode,
                    relato.Type,
                    Excerpt(relato.Text),
                    relato.ProjectPublicStage?.Label,
                    fechados.Contains(relato.Id),
                    relato.CreatedAt))
                .ToList(),
            temMais);
    }

    private static string Excerpt(string text)
    {
        const int Limit = 120;

        var limpo = text.Trim();

        if (limpo.Length <= Limit)
            return limpo;

        var corte = limpo.LastIndexOf(' ', Limit);

        return string.Concat(limpo.AsSpan(0, corte > 40 ? corte : Limit).TrimEnd(), "…");
    }

    /// <summary>
    /// O codigo pessoal deste relato: o que a pessoa apresentou, ou um novo.
    ///
    /// <para><b>Nulo quando o projeto nao usa este modo.</b> E se alguem mandar um
    /// codigo num projeto de protocolo, a recusa e explicita — aceitar em silencio
    /// gravaria um vinculo que a configuracao do projeto diz nao existir.</para>
    ///
    /// <para><b>Codigo desconhecido nao e erro: vira um codigo novo.</b> Recusar
    /// diria "este codigo nao existe aqui", e e exatamente o oraculo que este modo
    /// nao pode ter. A pessoa recebe um codigo novo na confirmacao e ve que mudou —
    /// que e a mesma coisa que aconteceria se ela nunca tivesse tido um.</para>
    /// </summary>
    private async Task<ReporterCode?> ResolveReporterCodeAsync(long projectId, string? apresentado, CancellationToken cancellationToken)
    {
        var identidade = await _unitOfWork.ProjectIdentitySettings
            .FindByProjectWithoutSessionAsync(projectId, cancellationToken);

        var modo = identidade?.Mode ?? IdentitySettingsDefaults.Mode;
        var digitado = (apresentado ?? string.Empty).Trim().ToUpperInvariant();

        if (modo != ReporterIdentityModeEnum.PersonalCode)
        {
            if (digitado.Length > 0)
                throw new ArgumentException("Este projeto nao usa codigo pessoal.");

            return null;
        }

        if (digitado.Length > 0)
        {
            var existente = await _unitOfWork.ReporterCodes
                .FindByCodeWithoutSessionAsync(projectId, digitado, cancellationToken);

            // Ver o paragrafo do metodo: desconhecido cai para um codigo novo, e nao
            // para uma recusa que contaria o que ele nao e.
            if (existente is not null)
                return existente;
        }

        for (var tentativa = 0; tentativa < TrackingCodeAttempts; tentativa++)
        {
            var candidato = TrackingCode.Generate();

            if (await _unitOfWork.ReporterCodes.ExistsAsync(projectId, candidato, cancellationToken))
                continue;

            var novo = new ReporterCode { ProjectId = projectId, Code = candidato };
            await _unitOfWork.ReporterCodes.AddAsync(novo, cancellationToken);

            return novo;
        }

        throw new InvalidOperationException(
            $"Nao foi possivel gerar um codigo pessoal unico em {TrackingCodeAttempts} tentativas.");
    }

    private async Task<string> GenerateTrackingCodeAsync(CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < TrackingCodeAttempts; attempt++)
        {
            var candidate = TrackingCode.Generate();

            if (!await _unitOfWork.Reports.TrackingCodeExistsAsync(candidate, cancellationToken))
                return candidate;
        }

        throw new InvalidOperationException(
            $"Nao foi possivel gerar um protocolo unico em {TrackingCodeAttempts} tentativas.");
    }

    public async Task<ReportDetailViewModel> GetAsync(Guid projectPublicId, Guid reportPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
            ?? throw new KeyNotFoundException("Relato nao encontrado.");

        // Consulta que grava. E de proposito: e aqui que se sabe que alguem do time
        // foi olhar, e esse instante comparado com o da criacao e metade da pergunta
        // de pesquisa. Registrar por um botao "marcar como lido" mediria o clique,
        // nao a leitura.
        //
        // Sem payload: origem, momento, projeto e relato ja sao colunas, e repetir
        // no campo livre criaria duas versoes do mesmo dado para divergirem depois.
        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = report.Id,
            Type = EventTypeEnum.ReportViewed,
            Source = EventSourceEnum.Panel,
        }, cancellationToken);

        var fechamento = await _unitOfWork.ReportClosures.FindCurrentAsync(report.Id, cancellationToken);
        var pedido = await _unitOfWork.ReportInfoRequests.FindOpenAsync(report.Id, cancellationToken);
        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        // **A conclusao, e nao a configuracao.** Quatro coisas precisam ser
        // verdade ao mesmo tempo, e a tela nao tem por que saber quais — ela le uma
        // resposta so e decide se oferece o botao.
        var podePedir = (regras?.InfoRequestEnabled ?? CycleSettingsDefaults.InfoRequestEnabled)
                        && report.AcceptsQuestions == true
                        && fechamento is null
                        && pedido is null;

        return Detail(report, ClosureOf(fechamento), InfoRequestOf(pedido), podePedir);
    }

    /// <summary>
    /// O relato aberto, campo a campo.
    ///
    /// <para>Existe porque <b>duas</b> acoes devolvem esta forma: abrir o relato e
    /// encerra-lo. A segunda nao pode chamar a primeira — abrir <b>grava</b> um
    /// evento de leitura, e encerrar registraria uma visualizacao que ninguem
    /// fez.</para>
    /// </summary>
    private static ReportDetailViewModel Detail(
        Report report,
        ReportClosureViewModel? closure,
        ReportInfoRequestViewModel? infoRequest,
        bool canAskInfo) => new(
        report.PublicId,
        report.TrackingCode,
        report.Type,
        report.Text,
        report.Route,
        report.Origin,
        report.ProjectState?.PublicId,
        report.ProjectState?.Name,
        report.ProjectPublicStage?.Label,
        report.AcceptsQuestions,
        report.PublicStageDueAt,
        report.CreatedAt,
        closure,
        infoRequest,
        canAskInfo,
        // Em ordem de chave, e nao na que o navegador mandou: a mesma informacao
        // trocando de lugar entre dois relatos faz procurar de novo a cada um.
        report.Contexts
            .OrderBy(context => context.Key, StringComparer.Ordinal)
            .Select(context => new ReportContextViewModel(context.Key, context.Value))
            .ToList());

    /// <summary>
    /// O projeto da sessao atual. O filtro global ja limita a consulta a conta que
    /// esta usando o painel, entao projeto de outra conta simplesmente nao volta —
    /// e a resposta e a mesma de um identificador inventado, de proposito: dizer
    /// "existe, mas nao e seu" confirmaria a existencia dele a um estranho.
    /// </summary>
    private async Task<Project> RequireOwnProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    public async Task<IReadOnlyList<ReportStateCountViewModel>> CountByStateAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var counts = await _unitOfWork.Reports.CountByStateAsync(project.Id, cancellationToken);

        // Qual coluna encerra vem da **mesma pergunta** que o movimento faz, e nao
        // de contar a lista de tras para a frente: a lista traz as aposentadas
        // junto, e a ultima delas nao encerra nada. Duas respostas para a mesma
        // pergunta e o jeito de a tela pedir motivo numa coluna e a API cobrar em
        // outra.
        // Projeto que encerra por botao nao tem coluna que encerre, e a resposta
        // diz isso: `ClosesReport` falso em todas as linhas. Sem este recorte, a
        // tela pediria motivo num movimento que a API nao vai cobrar.
        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);
        var gatilho = regras?.ClosureTrigger ?? CycleSettingsDefaults.ClosureTrigger;

        var ultimaAtiva = gatilho == ClosureTriggerEnum.LastColumn
            ? await _unitOfWork.ProjectStates.LastActiveAsync(project.Id, cancellationToken)
            : null;

        return counts
            .Select(count => new ReportStateCountViewModel(
                count.StatePublicId,
                count.StateName,
                count.IsActive,
                count.StateId is not null && count.StateId == ultimaAtiva?.Id,
                count.Total))
            .ToList();
    }

    /// <summary>
    /// Traduz o recorte que veio da rota.
    ///
    /// <para>Ausente e a fila inteira; <c>none</c> sao os que ainda nao tem lugar
    /// nela; um identificador e aquela coluna. <b>Identificador que nao existe no
    /// projeto e recusado</b> em vez de virar lista vazia: lista vazia responderia
    /// "nao ha relatos ali" a uma pergunta sobre uma coluna que nao existe, e
    /// ninguem descobriria o erro de digitacao.</para>
    /// </summary>
    private async Task<ReportStateFilter> ResolveStateFilterAsync(long projectId, string? state, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(state))
            return ReportStateFilter.All;

        if (string.Equals(state, WithoutStateFilter, StringComparison.OrdinalIgnoreCase))
            return ReportStateFilter.WithoutState;

        if (!Guid.TryParse(state, out var publicId))
            throw new ArgumentException($"Filtro de estado invalido. Informe um identificador de estado ou '{WithoutStateFilter}'.");

        var projectState = await _unitOfWork.ProjectStates.GetByPublicIdAsync(publicId, cancellationToken);

        if (projectState is null || projectState.ProjectId != projectId)
            throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

        return ReportStateFilter.In(projectState.Id);
    }

    private static ReportSummaryViewModel Map(Report report) => new(
        report.PublicId,
        report.TrackingCode,
        report.Type,
        report.Text,
        report.Route,
        report.Origin,
        report.ProjectState?.PublicId,
        report.ProjectState?.Name,
        report.ProjectPublicStage?.Label,
        report.AcceptsQuestions,
        report.PublicStageDueAt,
        report.CreatedAt);

    /// <summary>
    /// Guarda so o caminho. O que vem depois do <c>?</c> ou do <c>#</c> e descartado
    /// antes de gravar: <c>?token=</c>, <c>?cpf=</c> e <c>?email=</c> sao comuns em
    /// rota, e guardar isso seria comecar o produto vazando dado de quem relatou.
    /// </summary>
    private static string? SanitizeRoute(string? route)
    {
        var value = (route ?? string.Empty).Trim();
        if (value.Length == 0)
            return null;

        value = value.Split('?', '#')[0];

        return value.Length == 0 ? null : Trim(value, 500);
    }

    private static List<ReportContext> BuildContexts(Dictionary<string, string?>? context)
    {
        if (context is null || context.Count == 0)
            return [];

        return context
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Key))
            .Take(MaxContextEntries)
            .Select(pair => new ReportContext
            {
                Key = Trim(pair.Key.Trim(), 60)!,
                Value = Trim(pair.Value, 1000),
            })
            .ToList();
    }

    /// <summary>
    /// Corta em vez de recusar. Contexto e rota vem do navegador, nao de quem
    /// digitou: recusar o relato inteiro porque um user agent veio comprido faria a
    /// pessoa perder o que escreveu por um motivo que nao e dela.
    /// </summary>
    private static string? Trim(string? value, int maxLength)
    {
        var text = (value ?? string.Empty).Trim();

        if (text.Length == 0)
            return null;

        return text.Length <= maxLength ? text : text[..maxLength];
    }
}
