using System.Text.Json;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Filters;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Cards;
using Pds.Service.Limits;
using Pds.Service.Origins;
using Pds.Service.Reports;
using Pds.Service.Scanning;
using Pds.Service.Security;
using Pds.Service.WidgetTexts;
using Pds.Translation;

namespace Pds.Service.Services;

public partial class ReportService : IReportService
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

    /// <summary>
    /// O maior codigo pessoal aceito no corpo: o tamanho da coluna. Os sorteados tem
    /// catorze; a folga e para espaco em volta, que e cortado.
    /// </summary>
    private const int ReporterCodeMaxLength = 32;

    /// <summary>
    /// Quantos relatos a lista do painel traz quando ninguem pede outra coisa. Cinquenta
    /// e mais de duas telas de tabela: de vinte em vinte, passar o olho, ordenar e marcar
    /// todos dependiam de clicar em "Carregar mais".
    /// </summary>
    private const int DefaultPageSize = 50;

    /// <summary>
    /// Teto por pagina. O texto do relato vai inteiro na lista, entao uma pagina de
    /// mil linhas seriam megabytes numa resposta que a tela nao desenha.
    /// </summary>
    private const int MaxPageSize = 100;

    /// <summary>
    /// Quantos relatos a fila de moderacao mostra por vez.
    ///
    /// <para><b>Nao ha paginacao, e e escolha.</b> A fila e para ser esvaziada, e
    /// nao navegada: paginar convidaria a deixar a pagina dois para depois, que e
    /// exatamente o relato que fica pendente para sempre. Quando passa disto, o que
    /// falta e gente lendo, e nao pagina.</para>
    /// </summary>
    private const int ModerationPageSize = 50;

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

    private const string TrackingRefusal = TrackedReportGate.Refusal;

    /// <summary>
    /// Se confirmar, reabrir e responder ja aceitam o codigo pessoal no lugar do
    /// token do link. <b>Enquanto for falso, a regra "o codigo sozinho confirma e
    /// reabre" (<c>TrackingCodeCanAct</c>) e ignorada</b>: quem abre pela lista
    /// pessoal le o relato, e as tres acoes saem desligadas, seja qual for o valor
    /// gravado.
    ///
    /// <para><b>A API ignora, e nao so a tela esconde.</b> As tres acoes so passam
    /// pela porta do link (<see cref="TrackedReportGate"/>), e quem chega pelo codigo
    /// nao tem o token. Obedecer ao valor gravado ligava botoes que a propria API
    /// recusava com 404 — e o projeto que ligou a regra antes de ela sair da tela de
    /// Ciclo ficou sem como desliga-la.</para>
    ///
    /// <para><b>Nada e apagado.</b> A coluna, o valor gravado, o DTO e o salvamento
    /// seguem iguais, e a tela de Ciclo continua mandando de volta o que recebeu.
    /// Ignorar aqui, em vez de zerar no banco, e o que deixa a volta sem migracao e
    /// devolve a cada projeto a escolha que ele ja tinha feito.</para>
    ///
    /// <para><b>O que falta para virar verdadeiro:</b></para>
    /// <list type="number">
    /// <item><see cref="ConfirmAsync"/>, <see cref="ReopenAsync"/> e
    /// <see cref="ReplyAsync"/> aceitarem chave publica + codigo + protocolo como
    /// alternativa ao token, com a mesma conferencia de
    /// <see cref="OpenByReporterCodeAsync"/> — modo codigo pessoal, codigo que existe,
    /// relato daquele codigo, uma recusa so. E conferindo a regra gravada <b>dentro
    /// delas</b>: a acao desligada na resposta nao impede ninguem de chamar a rota
    /// direto.</item>
    /// <item>A pagina de acompanhamento mandar o codigo nessas tres chamadas quando
    /// nao tem o token.</item>
    /// <item>A tela de Ciclo mostrar a regra de novo: <c>MOSTRAR_REGRA_DO_CODIGO</c>,
    /// em <c>CycleSettingsScreen.tsx</c>, vira verdadeiro, os dois testes pulados
    /// voltam e sai o que confere que ela esta fora da tela.</item>
    /// <item>O texto que hoje diz que a regra e ignorada voltar a dizer que ela
    /// decide: a observacao de <c>by-code/open</c> no controlador, a de
    /// <see cref="IReportService.OpenByReporterCodeAsync"/>, o resumo de
    /// <c>OpenByReporterCodeDto</c>, o campo <c>TrackingCodeCanAct</c> em
    /// <c>CycleSettingsDto</c>, <c>CycleSettingsViewModel</c> e
    /// <c>ProjectCycleSettings</c>, o contrato <c>cycleSettings.ts</c> da web, as paginas
    /// <c>rotas-publicas</c>, <c>codigo-e-moderacao</c>, <c>pedido-e-espera</c>,
    /// <c>configuracoes</c>, <c>o-ciclo-fecha</c>, <c>identidade-e-visibilidade</c> e
    /// <c>o-que-existe</c> da documentacao, e os comentarios
    /// da pagina de acompanhamento (<c>report.ts</c>, <c>reportService.ts</c>,
    /// <c>tracking.ts</c>, <c>TrackingPage.tsx</c>).</item>
    /// </list>
    /// <para>Feito isso, a volta da API e esta linha — o espelho da constante da
    /// tela. Ler os arquivos do relato pelo codigo ja existe, e nao depende daqui:
    /// ler nunca foi agir (ver ReporterCodeGate).</para>
    /// </summary>
    private const bool ActionsAcceptReporterCode = false;

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

    /// <summary>
    /// Quem avisa as outras telas do projeto que um card mudou — sempre depois da
    /// gravacao, e sem derrubar a acao se falhar. Ver <see cref="IWorkNotifier"/>.
    /// </summary>
    private readonly IWorkNotifier _notifier;

    /// <summary>
    /// As camadas de limite da entrada do relato, na memoria do processo. Uma instancia
    /// para a API inteira: ver <see cref="ReportLimiter"/>.
    /// </summary>
    private readonly ReportLimiter _limiter;

    public ReportService(IUnitOfWork unitOfWork, IAccountContext accountContext, IDelayedScheduler scheduler, IWorkNotifier notifier, ReportLimiter limiter)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
        _scheduler = scheduler;
        _notifier = notifier;
        _limiter = limiter;
    }

    public async Task<CreatedReportViewModel> CreateAsync(CreateReportDto dto, string? clientIp, CancellationToken cancellationToken = default)
    {
        // Antes de qualquer leitura: um codigo maior que a coluna nao e codigo de
        // ninguem, e recusar pelo tamanho nao conta nada sobre os que existem.
        if ((dto.ReporterCode?.Length ?? 0) > ReporterCodeMaxLength)
            throw new ArgumentException($"O codigo pessoal pode ter ate {ReporterCodeMaxLength} caracteres.");

        var project = await RequireProjectAsync(dto.Key, cancellationToken);

        // Arquivar para de aceitar coisa nova sem perder o que ja entrou. E o motivo
        // de a recusa ser 403 e nao 404: o projeto existe, e a chave esta certa.
        if (project.Status == ProjectStatusEnum.Archived)
            throw new ForbiddenException("Este projeto esta arquivado e nao aceita relatos novos.");

        // O endereco bloqueado, conferido aqui tambem e nao so na leitura da
        // configuracao: la ele evita que o formulario abra, e aqui ele e o que de fato
        // impede o relato de entrar. Sem esta, bastaria falar direto com a rota para a
        // lista nao valer nada. A lista e lida a cada relato: o bloqueio vale na hora.
        await OriginGate.EnsureNotBlockedAsync(_unitOfWork, project.Id, dto.Origin, cancellationToken);

        if (dto.TypeId is not Guid tipoPublicId)
            throw new ArgumentException("Informe o tipo do relato.");

        // O tipo e do projeto e esta ativo: a ferramenta so oferece esses. O desativado
        // depois de ela abrir e o caso comum de chegar aqui, e a mensagem diz o que
        // fazer em vez de so recusar. Sem sessao, como toda leitura desta entrada.
        var tipo = await _unitOfWork.ProjectReportTypes
            .FindByPublicIdWithoutSessionAsync(project.Id, tipoPublicId, cancellationToken);

        if (tipo is null || !tipo.IsActive)
            throw new ArgumentException("Este tipo de relato nao esta mais disponivel. Escolha outro.");

        var (text, answers) = ReportForm.Read(tipo, dto.Questions, dto.Answers, dto.Text);

        // O titulo e o que a pessoa respondeu a pergunta curta da ferramenta. A
        // pergunta escondida nao faz a API recusar quem mandar titulo assim mesmo:
        // nao ha o que proteger recusando — ele so nao e pedido.
        var titulo = CardText.Title(dto.Title);
        var ferramenta = await _unitOfWork.ProjectWidgetSettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        if (titulo is null && (ferramenta?.ReportTitleMode ?? WidgetSettingsDefaults.ReportTitleMode) == ReportTitleModeEnum.Required)
            throw new ArgumentException("Escreva o titulo: em poucas palavras, o que aconteceu.");

        // Os limites, depois do que recusa o relato mal formado (que nao conta) e antes
        // de qualquer gravacao: a pausa avisa o time numa gravacao propria, e nada do
        // relato pode ir junto nela.
        var (remetente, limites) = await CheckLimitsAsync(project, dto, clientIp, cancellationToken);

        // Fora da lista de autorizados — ou sem dizer de onde veio —, o relato e
        // recebido e fica retido. Quem relatou nao percebe nada; o time nao o ve ate
        // permitir o endereco. O primeiro retido de um endereco avisa quem administra.
        var agora = DateTime.UtcNow;
        var retido = await OriginGate.IsHeldAsync(_unitOfWork, project.Id, dto.Origin, cancellationToken);
        var avisarEndereco = retido
            && !await _unitOfWork.Reports.AnyHeldFromOriginWithoutSessionAsync(project.Id, remetente.Origin, cancellationToken);

        var (token, tokenHash) = AccessToken.Generate();

        var landingStateId = await ResolveLandingStateAsync(project.Id, tipo, cancellationToken);

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

        // O numero vem depois de tudo o que podia recusar o relato: reservado para um
        // relato recusado, ele seria um buraco a toa na sequencia do time.
        var numero = await _unitOfWork.Projects.NextCardNumberAsync(project.Id, cancellationToken);
        var protocolo = await GenerateTrackingCodeAsync(cancellationToken);

        // O lugar no quadro vem junto do numero, e pelo mesmo motivo: o relato novo
        // entra no topo da coluna, acima de tudo, sem ninguem ler a coluna.
        var topo = await _unitOfWork.Projects.NextTopRankAsync(project.Id, cancellationToken);

        var report = new Report
        {
            Kind = CardKindEnum.Report,
            Number = numero,
            // No fim do backlog, como todo card novo.
            BacklogRank = numero * Report.BoardRankGap,
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReporterCode = codigoPessoal,
            TrackingCode = protocolo,
            AccessTokenHash = tokenHash,
            ReportTypeId = tipo.Id,
            ReportType = tipo,
            ReporterTitle = titulo,
            Text = text,
            Answers = answers,
            Route = SanitizeRoute(dto.Route),
            // Na forma em que as listas comparam — minusculo, sem esquema e sem caminho
            // —, e nao como veio: e por este campo que a tela de Dominios conta quem
            // mandou relatos, e que a marca de origem bloqueada se acende.
            Origin = Trim(OriginDomain.ForComparison(dto.Origin), 260),
            HeldForOriginAt = retido ? agora : null,
            ProjectStateId = landingStateId,
            BoardRank = topo,
            StateChangedAt = DateTime.UtcNow,
            AcceptsQuestions = aceitaDuvidas,
            ReporterName = Trim(dto.ReporterName, Report.MaxReporterNameLength),
            // **Sem nome, assinar nao faz nada.** Gravar o sim isolado deixaria o
            // relato com uma escolha que nao tem o que mostrar — e no dia em que
            // alguem preenchesse o nome por outro caminho, ele sairia publicado por
            // uma marcacao antiga que a pessoa nao lembra de ter feito.
            ReporterNameIsPublic = dto.ReporterNameIsPublic == true
                                   && !string.IsNullOrWhiteSpace(dto.ReporterName),
            // **Explicito, e nao pelo primeiro valor do enum.** Vale a mesma regra
            // em projeto privado: nascer liberado faria marcar o projeto como
            // publico publicar o historico inteiro de uma vez.
            ModerationState = ReportModerationStateEnum.Pending,
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
                // O tipo como era na entrada: o identificador, que nao muda, e o nome da
                // epoca — renomear o tipo depois nao reescreve o que chegou.
                type_id = tipo.PublicId,
                type_name = tipo.Name,
                origin = report.Origin,
                route = report.Route,
                text_length = text.Length,
                // O tamanho, e nao o titulo: e texto de uma pessoa, e esta tabela nao
                // se apaga. Zero diz que ela nao respondeu.
                title_length = titulo?.Length ?? 0,
                // Retido por ter vindo de um endereco fora da lista de autorizados.
                held = retido,
            }),
        }, cancellationToken);

        // E ja nasce numa etapa da jornada, se houver uma para ele.
        //
        // **Traduzir so no movimento nao bastaria**: o relato que chega e nunca e
        // movido ficaria invisivel para quem o escreveu — a pagina de acompanhamento
        // abriria sem nada, justamente no momento em que a pessoa mais quer olhar.
        //
        // As leituras sao as **sem sessao**: o relato entra pela chave publica, e ali
        // a lista de projetos acessiveis esta vazia.
        if (landingStateId is long landing)
        {
            var mapa = await _unitOfWork.ProjectStatusMappings
                .ListByVersionWithoutSessionAsync(project.Id, project.MappingVersion, cancellationToken);
            var etapas = await _unitOfWork.ProjectPublicStages
                .ListByProjectWithoutSessionAsync(project.Id, cancellationToken);

            await ApplyPublicStageAsync(project, report, landing, EventSourceEnum.Widget, null, mapa, etapas, cancellationToken);
        }

        // O aviso do endereco novo vai na mesma gravacao do relato: sem relato, nao ha o
        // que avisar; e com o relato gravado sem o aviso, o time nunca saberia dele.
        var avisados = avisarEndereco
            ? await AddProjectNoticeAsync(project, NotificationKindEnum.OriginPending, NoticeSubject(remetente.Origin), null, null, cancellationToken)
            : [];

        await _unitOfWork.CommitAsync(cancellationToken);

        _limiter.Record(remetente, limites, agora);

        // O retido nao aparece em tela nenhuma do time: avisar o Trabalho de um card
        // novo faria a tela reler e nao achar nada.
        if (!retido)
            await _notifier.CardChangedAsync(report.PublicId);

        foreach (var pessoa in avisados)
            await _notifier.NotificationArrivedAsync(project.PublicId, pessoa, NotificationKindEnum.OriginPending);

        return new CreatedReportViewModel(protocolo, token, report.CreatedAt, codigoPessoal?.Code);
    }

    /// <summary>
    /// Confere as camadas de limite deste envio e recusa com 429 o que passou: cedo
    /// demais (sem desafio), o desafio a resolver, ou a pausa — que, quando comeca,
    /// avisa quem administra no sino.
    ///
    /// <para><b>Quem relata</b> e o codigo pessoal so no projeto que usa esse modo e
    /// quando ele vem; senao, o IP. O codigo e escolhido por quem manda — trocar a cada
    /// envio escapa da camada da pessoa, e e por isso que a do IP e a do projeto
    /// existem.</para>
    /// </summary>
    private async Task<(ReportLimiter.Sender Remetente, ProjectReportLimits Limites)> CheckLimitsAsync(
        Project project, CreateReportDto dto, string? clientIp, CancellationToken cancellationToken)
    {
        var limites = await _unitOfWork.ProjectReportLimits.FindByProjectWithoutSessionAsync(project.Id, cancellationToken)
                      ?? new ProjectReportLimits { ProjectId = project.Id };

        var identidade = await _unitOfWork.ProjectIdentitySettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);
        var codigo = (identidade?.Mode ?? IdentitySettingsDefaults.Mode) == ReporterIdentityModeEnum.PersonalCode
            ? (dto.ReporterCode ?? string.Empty).Trim().ToUpperInvariant()
            : string.Empty;

        // So o que tem a forma de um codigo vira chave da camada da pessoa. A chave fica
        // na memoria por um dia: um texto qualquer, do tamanho que quem manda quiser,
        // a cada envio, enchia a memoria do processo. O resto cai no IP, como quem nao
        // mandou codigo nenhum.
        if (!TrackingCode.IsWellFormed(codigo))
            codigo = string.Empty;

        var remetente = new ReportLimiter.Sender(
            project.Id,
            project.PublicId,
            string.IsNullOrWhiteSpace(clientIp) ? "desconhecido" : clientIp,
            codigo.Length > 0 ? codigo : null,
            Trim(OriginDomain.ForComparison(dto.Origin), 260) ?? string.Empty);

        var agora = DateTime.UtcNow;
        var veredito = _limiter.Check(remetente, limites, dto.ChallengeToken, dto.ChallengeNonce, agora);

        switch (veredito)
        {
            case ReportLimiter.Verdict.TooSoon cedo:
                throw new TooManyRequestsException(
                    "Espere alguns segundos antes de enviar outro relato.",
                    cedo.RetryAfterSeconds,
                    new ReportRefusalViewModel(ReportRefusalReasonEnum.TooSoon, cedo.RetryAfterSeconds, null, null));

            case ReportLimiter.Verdict.Challenge desafio:
                throw new TooManyRequestsException(
                    "Muitos relatos em pouco tempo: confirme o envio para continuar.",
                    1,
                    new ReportRefusalViewModel(
                        ReportRefusalReasonEnum.Challenge,
                        1,
                        null,
                        new ReportChallengeViewModel(desafio.Issued.Token, desafio.Issued.Difficulty, desafio.Issued.ExpiresAt)));

            case ReportLimiter.Verdict.Paused pausa:
            {
                var segundos = (int)Math.Ceiling((pausa.Until - agora).TotalSeconds);

                if (pausa.Notify)
                {
                    var avisados = await AddProjectNoticeAsync(
                        project, NotificationKindEnum.ReportsPaused, pausa.Subject, pausa.Scope, pausa.Until, cancellationToken);
                    await _unitOfWork.CommitAsync(cancellationToken);

                    foreach (var pessoa in avisados)
                        await _notifier.NotificationArrivedAsync(project.PublicId, pessoa, NotificationKindEnum.ReportsPaused);
                }

                var minutos = Math.Max(1, (int)Math.Ceiling(segundos / 60.0));
                throw new TooManyRequestsException(
                    $"Recebemos relatos demais em pouco tempo, e novos envios estao pausados. Tente de novo em {minutos} {(minutos == 1 ? "minuto" : "minutos")}.",
                    segundos,
                    new ReportRefusalViewModel(ReportRefusalReasonEnum.Paused, segundos, pausa.Until, null));
            }
        }

        return (remetente, limites);
    }

    /// <summary>
    /// Um aviso do projeto — endereco novo, ou envios pausados — para cada pessoa que
    /// administra. Sem card: o retido nao aparece para o time, e a pausa nao e de relato
    /// nenhum. Devolve quem foi avisado, para o tempo real depois da gravacao.
    /// </summary>
    private async Task<IReadOnlyList<Guid>> AddProjectNoticeAsync(
        Project project,
        NotificationKindEnum kind,
        string? subject,
        ReportLimitScopeEnum? scope,
        DateTime? pausedUntil,
        CancellationToken cancellationToken)
    {
        var pessoas = await _unitOfWork.ProjectMembers
            .ListAdministratorsWithoutSessionAsync(project.Id, project.AccountId, cancellationToken);

        foreach (var pessoa in pessoas)
        {
            await _unitOfWork.Notifications.AddAsync(new Notification
            {
                UserId = pessoa.Id,
                ProjectId = project.Id,
                Kind = kind,
                Subject = subject,
                LimitScope = scope,
                PausedUntil = pausedUntil,
            }, cancellationToken);
        }

        return pessoas.Select(pessoa => pessoa.PublicId).ToList();
    }

    /// <summary>O endereco no aviso: nulo para o relato que nao disse de onde veio.</summary>
    private static string? NoticeSubject(string origin) => origin.Length > 0 ? origin : null;

    /// <summary>
    /// O relato por tras de um link de acompanhamento, ou a recusa.
    ///
    /// <para><b>A conferencia mora em <see cref="TrackedReportGate"/>.</b> Ela
    /// deixou de ser assunto so daqui quando o anexo passou a precisar da mesma
    /// porta — e uma porta copiada e uma porta que um dia diverge.</para>
    /// </summary>
    private Task<Report> RequireTrackedReportAsync(string? trackingCode, string? token, CancellationToken cancellationToken)
        => TrackedReportGate.RequireAsync(_unitOfWork, trackingCode, token, cancellationToken);

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

        return await BuildPublicAsync(report, podeAgir: true, cancellationToken);
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

        await _notifier.CardChangedAsync(report.PublicId);

        return await BuildPublicAsync(report, podeAgir: true, cancellationToken);
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

        // Os duplicados que receberam este encerramento voltam a esperar o proximo.
        await WithdrawCopiedClosuresAsync(project, report, fechamento, EventSourceEnum.PublicPage, null, cancellationToken);

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
        }

        // Volta no topo da coluna, mude de coluna ou nao, como todo card que chega sem
        // ser arrastado: o relato reaberto e o que o time precisa ver primeiro.
        await PutOnTopAsync(report, cancellationToken);

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

        var voltaram = await UnarchiveFromOutsideAsync(report, "reopened", cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.CardChangedAsync(report.PublicId);
        foreach (var subtarefa in voltaram ?? [])
            await _notifier.CardChangedAsync(subtarefa);

        return await BuildPublicAsync(report, podeAgir: true, cancellationToken);
    }

    /// <summary>
    /// Traz de volta para a tela de Trabalho o relato arquivado em que quem relatou
    /// acabou de escrever — reabrindo, ou respondendo a uma pergunta do time.
    ///
    /// <para><b>Arquivar nunca deixa a pessoa sem retorno</b>: o relato aberto e
    /// encerrado junto, com o motivo, e ela pode reabrir. Reabrir e ela dizendo que
    /// ainda nao acabou — e isso nao pode cair num lugar que o time nao olha. A
    /// origem <c>public_page</c> diz no historico que quem trouxe de volta foi ela.</para>
    ///
    /// <para>Devolve as subtarefas que voltaram junto — quem chama avisa o painel
    /// delas depois de gravar —, ou nulo quando o card nao estava no arquivo.</para>
    /// </summary>
    private async Task<List<Guid>?> UnarchiveFromOutsideAsync(Report report, string motivo, CancellationToken cancellationToken)
    {
        // O duplicado que volta deixa de ser duplicado: ver o metodo.
        await DetachDuplicateFromOutsideAsync(report, cancellationToken);

        if (report.ArchivedAt is null)
            return null;

        // As subtarefas que foram com ele voltam junto, como na volta pelo painel.
        var subtarefas = await SetArchivedWithSubtasksAsync(
            report.Project, report, arquivar: false, EventSourceEnum.PublicPage, new { because = motivo }, cancellationToken);

        return subtarefas.Select(subtarefa => subtarefa.PublicId).ToList();
    }

    /// <summary>
    /// Poe o card no topo da coluna em que ele fica, como todo card que chega sem ser
    /// arrastado, e conta a chegada como a entrada dele na coluna — a ultima coluna do
    /// quadro nao esconde o que acabou de voltar.
    /// </summary>
    private async Task PutOnTopAsync(Report report, CancellationToken cancellationToken)
    {
        report.BoardRank = await _unitOfWork.Projects.NextTopRankAsync(report.ProjectId, cancellationToken);
        report.StateChangedAt = DateTime.UtcNow;
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
    /// <param name="podeAgir">
    /// Se quem esta lendo pode <b>agir</b> — confirmar, reabrir, responder.
    ///
    /// <para><b>E parametro obrigatorio, e nao um padrao.</b> Quem chega pelo link
    /// pode; quem chega pela lista pessoal hoje nao pode, e so vai poder quando as
    /// acoes aceitarem o codigo e o projeto tiver ligado isso — ver
    /// <see cref="ActionsAcceptReporterCode"/>. Um valor padrao faria a chamada nova
    /// nascer permitindo, que e o lado errado para errar — e obrigar a declarar forca
    /// quem acrescentar um caminho a pensar nele.</para>
    /// </param>
    private async Task<PublicReportViewModel> BuildPublicAsync(Report report, bool podeAgir, CancellationToken cancellationToken)
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
                    podeAgir && !respondeu,
                    // Quem confirmou fechou a conversa: o problema que volta depois
                    // disso e outro relato.
                    podeAgir && (regras?.AllowsReopen ?? CycleSettingsDefaults.AllowsReopen) && !respondeu,
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

        // O que ela disse ao reabrir. E texto dela, e volta para ela: o fechamento
        // reaberto sai de `Closure`, e sem esta lista o motivo era gravado e nunca
        // mais lido.
        var reaberturas = await _unitOfWork.ReportClosures
            .ListReopenedWithoutSessionAsync(report.Id, cancellationToken);

        var (protocolo, tipo, texto) = report.ReporterFields();

        // A frase do topo da pagina e escrita na tela da ferramenta, e mora na
        // configuracao dela. Sem sessao: quem le aqui e quem relatou.
        var ferramenta = await _unitOfWork.ProjectWidgetSettings
            .FindByProjectWithoutSessionAsync(report.ProjectId, cancellationToken);

        var abertura = ferramenta?.TrackingIntro ?? WidgetSettingsDefaults.TrackingIntro;

        // O titulo que ela escreveu, e nunca o do time: o reescrito no painel e
        // interno, e quem relatou ve so o que escreveu. Do tipo, so o nome: a cor e o
        // desenho sao do painel e da ferramenta.
        return new PublicReportViewModel(
            protocolo,
            tipo.Name,
            report.ReporterTitle,
            texto,
            AnswersOf(report),
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
            // Escrever so enquanto ha pergunta aberta — e so para quem pode agir.
            podeAgir && pedido is not null,
            reaberturas
                .Select(reabertura => new PublicReopeningViewModel(
                    reabertura.PublicId, reabertura.ReopenedAt!.Value, reabertura.ReopenComment))
                .ToList(),
            abertura,
            FirstNameOf(report.ReporterName),
            // O nome do projeto e interno: so sai quando o proprio projeto o escreveu.
            WidgetText.Uses(abertura, WidgetText.Project) ? report.Project.Name : null);
    }

    /// <summary>
    /// A primeira palavra do nome que a pessoa deu, ou nulo. E o que <c>{{primeiroNome}}</c>
    /// usa: "Ana Paula Souza" vira "Ana".
    /// </summary>
    private static string? FirstNameOf(string? name)
    {
        var palavras = (name ?? string.Empty).Trim().Split((char[]?)null, 2, StringSplitOptions.RemoveEmptyEntries);
        return palavras.Length == 0 ? null : palavras[0];
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

        if (report.Kind == CardKindEnum.Team)
            throw new ConflictException("O card do time nao tem quem relatou para responder.");

        EnsureNotArchived(report, "perguntar a quem relatou");

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

        await _notifier.CardChangedAsync(report.PublicId);

        return Detail(report, null, InfoRequestOf(pedido), canAskInfo: false,
            await ReopeningsOfAsync(report.Id, cancellationToken), AllowsReportArchiving(regras),
            await TeamIdsForAsync([report], cancellationToken),
            await FaceOfAsync(report, cancellationToken));
    }

    public async Task<PublicReportViewModel> ReplyAsync(ReplyToReportDto dto, CancellationToken cancellationToken = default)
    {
        var report = await RequireTrackedReportAsync(dto.TrackingCode, dto.Token, cancellationToken);

        // **So enquanto ha pergunta aberta.** Sem isto, a rota viraria uma caixa de
        // entrada sem dono e sem moderacao — e a conversa nao passa por moderacao,
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

        // Desarquivado pela resposta dela, volta ao quadro pelo topo, como o reaberto.
        var voltaram = await UnarchiveFromOutsideAsync(report, "replied", cancellationToken);
        if (voltaram is not null)
            await PutOnTopAsync(report, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);
        await _notifier.CardChangedAsync(report.PublicId);
        foreach (var subtarefa in voltaram ?? [])
            await _notifier.CardChangedAsync(subtarefa);

        // **A mensagem agendada nao e cancelada**, e nao precisa: ao chegar, ela nao
        // vai encontrar pedido aberto e se descarta. A mesma propriedade da espera.
        return await BuildPublicAsync(report, podeAgir: true, cancellationToken);
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
            await _notifier.CardChangedAsync(report.PublicId);
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
        await _notifier.CardChangedAsync(report.PublicId);
    }

    public Task<IReadOnlyList<Guid>> ListOverdueInfoRequestsAsync(CancellationToken cancellationToken = default)
        => _unitOfWork.ReportInfoRequests.ListOverdueWithoutSessionAsync(DateTime.UtcNow, cancellationToken);

    private static ReportInfoRequestViewModel? InfoRequestOf(ReportInfoRequest? request)
        => request is null
            ? null
            : new ReportInfoRequestViewModel(
                request.AskedByUser?.Name, request.AskedAt, request.WarnAt, request.CloseAt);

    public async Task<ReportPageViewModel> ListAsync(Guid projectPublicId, int page, int pageSize, string? state, bool archived = false, string? order = null, Guid? after = null, ReportFilterDto? filters = null, string? sort = null, string? dir = null, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var ordem = ResolveOrder(order);
        var ordenacao = ResolveSort(sort, dir, ordem);
        var filter = await ResolveStateFilterAsync(project.Id, state, cancellationToken);
        var cards = await ResolveCardFilterAsync(project, filters, cancellationToken);
        var depois = after is Guid referencia
            ? await ResolveAfterAsync(project.Id, referencia, filter, archived, ordem, cancellationToken)
            : (BoardSpot?)null;
        var desde = await LastColumnWindowAsync(project.Id, filter, archived, ordem, cancellationToken);

        var size = Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaxPageSize);
        var current = Math.Max(page, 1);

        var total = await _unitOfWork.Reports.CountByProjectAsync(project.Id, filter, archived, desde, cards, cancellationToken);

        // Em long porque o produto estoura o int muito antes de estourar a tabela:
        // pagina 200 milhoes vezes 20 nao existe como pergunta, mas chega como
        // numero, e em int ele volta negativo e a consulta quebra em vez de
        // responder "acabou".
        //
        // Depois de um card, a pagina e a primeira que vem depois dele.
        var skip = depois is null ? (long)(current - 1) * size : 0;

        if (skip >= total)
            return new ReportPageViewModel([], total);

        var reports = await _unitOfWork.Reports.ListByProjectAsync(project.Id, filter, archived, ordem, desde, depois, (int)skip, size, cards, ordenacao, cancellationToken);

        var time = await TeamIdsForAsync(reports, cancellationToken);
        var ids = reports.Select(report => report.Id).ToList();
        var faces = await _unitOfWork.Reports.CountFacesAsync(ids, cancellationToken);
        var marcas = await _unitOfWork.Reports.ListSubtaskMatchesAsync(ids, cards, cancellationToken);

        return new ReportPageViewModel(
            reports
                .Select(report => Map(report, time, faces.GetValueOrDefault(report.Id, CardFace.Empty)) with
                {
                    SubtaskMatch = SubtaskMatchOf(marcas.GetValueOrDefault(report.Id)),
                })
                .ToList(),
            total);
    }

    /// <summary>
    /// A marca do pai que entrou pelas subtarefas. Quem olha vira "sua" na tela, e nao o
    /// proprio nome.
    /// </summary>
    private SubtaskMatchViewModel? SubtaskMatchOf(SubtaskMatch? match)
        => match is null
            ? null
            : new SubtaskMatchViewModel(
                match.Assignees
                    .Select(pessoa => new SubtaskAssigneeMatchViewModel(
                        pessoa.UserPublicId, pessoa.Name, pessoa.UserId == _accountContext.UserId, pessoa.Count))
                    .ToList(),
                match.Search);

    /// <summary>
    /// O card depois do qual o "Mostrar mais" do quadro continua.
    ///
    /// <para><b>So na ordem do quadro, e numa coluna.</b> E a continuacao pelo lugar
    /// na coluna, e nao pelo numero da pagina: o card que sai de cima, ou chega ao
    /// topo, muda as paginas, e a seguinte pularia um card ou repetiria outro. O card
    /// que ja saiu da coluna — movido ou arquivado — da 409, e a tela le a coluna de
    /// novo.</para>
    /// </summary>
    private async Task<BoardSpot> ResolveAfterAsync(long projectId, Guid after, ReportStateFilter filter, bool archived, ReportListOrder ordem, CancellationToken cancellationToken)
    {
        if (ordem != ReportListOrder.Board || !filter.Restricted)
            throw new ArgumentException("O after so vale na ordem do quadro (order=board) e numa coluna (state).");

        var ancora = await _unitOfWork.Reports.FindBoardSpotAsync(projectId, after, cancellationToken)
                     ?? throw new KeyNotFoundException("O card de referencia nao foi encontrado neste projeto.");

        if (ancora.StateId != filter.StateId || ancora.Archived != archived)
            throw new ConflictException("O card de referencia nao esta mais nesta coluna. Leia a coluna de novo.");

        return ancora;
    }

    /// <summary>A ordem pedida: <c>recent</c> (o padrao) ou <c>board</c>.</summary>
    private static ReportListOrder ResolveOrder(string? order)
        => order?.Trim().ToLowerInvariant() switch
        {
            null or "" or "recent" => ReportListOrder.Recent,
            "board" => ReportListOrder.Board,
            "backlog" => ReportListOrder.Backlog,
            _ => throw new ArgumentException("Ordem desconhecida. Use recent, board ou backlog."),
        };

    /// <summary>
    /// A regra da ultima coluna do quadro: de quando para ca ela mostra.
    ///
    /// <para><b>So no quadro, e so na ultima coluna ativa.</b> A lista continua
    /// mostrando tudo — e para onde vai quem procura o encerrado de meses atras —, e
    /// as outras colunas nao acumulam: o trabalho passa por elas. Nulo quando a
    /// regra nao vale aqui, ou quando o projeto escolheu mostrar todos.</para>
    ///
    /// <para><b>Com uma coluna so, a regra nao vale.</b> Todo projeto nasce assim, e
    /// ai a unica coluna e a entrada da fila, e nao onde o trabalho termina: esconder
    /// o que chegou ha mais tempo seria esconder o relato que ninguem olhou.</para>
    /// </summary>
    private async Task<DateTime?> LastColumnWindowAsync(long projectId, ReportStateFilter filter, bool archived, ReportListOrder ordem, CancellationToken cancellationToken)
    {
        if (ordem != ReportListOrder.Board || archived || filter is not { Restricted: true, StateId: long estadoId })
            return null;

        var ultima = await _unitOfWork.ProjectStates.LastActiveAsync(projectId, cancellationToken);
        if (ultima?.Id != estadoId)
            return null;

        if (await _unitOfWork.ProjectStates.CountActiveAsync(projectId, cancellationToken) < 2)
            return null;

        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(projectId, cancellationToken);
        var dias = regras?.LastColumnVisibleDays ?? CycleSettingsDefaults.LastColumnVisibleDays;

        return dias > 0 ? DateTime.UtcNow.AddDays(-dias) : null;
    }

    // ─── Card do time ─────────────────────────────────────────────────────────

    public async Task<ReportDetailViewModel> CreateTeamCardAsync(Guid projectPublicId, CreateTeamCardDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        // Arquivar o projeto para de aceitar coisa nova — de fora e de dentro.
        if (project.Status == ProjectStatusEnum.Archived)
            throw new ForbiddenException("Este projeto esta arquivado e nao aceita cards novos.");

        var titulo = RequireTitle(dto.Title);
        var descricao = NormalizeDescription(dto.Description);
        var pai = await ResolveParentAsync(project.Id, dto, cancellationToken);
        // A subtarefa nasce no primeiro estado, o comeco do trabalho — e sem responsavel:
        // quem a pega e quem a faz.
        var estado = await ResolveTeamCardStateAsync(project.Id, pai is null ? dto.StatePublicId : null, cancellationToken);
        // Com sprint ligada: o criado numa coluna do quadro entra na sprint que veio; a
        // subtarefa, na do pai; o resto, no backlog.
        var sprint = await ResolveCreateSprintAsync(project.Id, pai, dto.SprintPublicId, cancellationToken);
        // O responsavel e a prioridade de quem ja os escolhe ao criar, pelas regras do
        // campo: so quem esta no time agora, so prioridade ativa do projeto — com as
        // mesmas recusas.
        var responsavel = dto.AssigneeUserPublicId is Guid pessoa
            ? await RequireAssigneeAsync(project.AccountId, project.Id, pessoa, cancellationToken)
            : null;
        var prioridade = dto.PriorityPublicId is Guid escolhida
            ? await RequirePriorityAsync(project.Id, escolhida, null, cancellationToken)
            : null;
        var autorId = _accountContext.UserId ?? throw new UnauthorizedAccessException("Sessao nao identificada.");

        // Tudo numa transacao so — o numero, o card, o "criou" e, quando vieram, o
        // responsavel e a prioridade: ou o card nasce inteiro, ou nao nasce.
        Guid? avisado = null;
        var card = await _unitOfWork.InTransactionAsync(async ct =>
        {
            // Depois de tudo o que podia recusar: numero reservado para card recusado
            // seria um buraco a toa.
            var numero = await _unitOfWork.Projects.NextCardNumberAsync(project.Id, ct);

            // No topo da coluna, como o relato que chega.
            var topo = await _unitOfWork.Projects.NextTopRankAsync(project.Id, ct);

            var novo = new Report
            {
                Kind = CardKindEnum.Team,
                Number = numero,
                // No fim do backlog, como todo card novo.
                BacklogRank = numero * Report.BoardRankGap,
                AccountId = project.AccountId,
                ProjectId = project.Id,
                Title = titulo,
                Description = descricao,
                ProjectStateId = estado?.Id,
                ProjectState = estado,
                BoardRank = topo,
                StateChangedAt = DateTime.UtcNow,
                CreatedByUserId = autorId,
                ParentReportId = pai?.Id,
                SprintId = sprint?.Id,
                // O banco so aceita card do time pendente: e o que o mantem fora da
                // lista publica mesmo que alguem esqueca o filtro numa consulta.
                ModerationState = ReportModerationStateEnum.Pending,
            };

            await _unitOfWork.Reports.AddAsync(novo, ct);

            // Na mesma gravacao do card, como o do relato. Sem titulo nem descricao: a
            // tabela de eventos nao se apaga, e o texto e do card.
            await _unitOfWork.Events.AddAsync(new Event
            {
                AccountId = project.AccountId,
                ProjectId = project.Id,
                Report = novo,
                UserId = autorId,
                Type = EventTypeEnum.TeamCardCreated,
                Source = EventSourceEnum.Panel,
                Payload = JsonSerializer.Serialize(new
                {
                    number = numero,
                    state_id = estado?.PublicId,
                    state_name = estado?.Name,
                    description_length = descricao?.Length ?? 0,
                    parent_id = pai?.PublicId,
                    parent_number = pai?.Number,
                    sprint_id = sprint?.PublicId,
                }),
            }, ct);

            await _unitOfWork.CommitAsync(ct);

            // O responsavel e a prioridade escolhidos ao criar ficam como se escolhidos
            // pelo campo logo depois, pelo mesmo codigo: o mesmo evento no historico,
            // depois do "criou", e o mesmo aviso no sino. Por isso o card grava antes —
            // o evento e o aviso apontam para ele.
            if (responsavel is not null)
                avisado = await AssignAsync(project, novo, responsavel, ct);
            if (prioridade is not null)
                await PrioritizeAsync(project, novo, prioridade, ct);
            if (responsavel is not null || prioridade is not null)
                await _unitOfWork.CommitAsync(ct);

            return novo;
        }, cancellationToken);

        card.CreatedByUser = await _unitOfWork.Users.GetByIdAsync(autorId, cancellationToken);
        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);

        await _notifier.CardChangedAsync(card.PublicId);

        if (avisado is Guid avisada)
            await _notifier.NotificationArrivedAsync(project.PublicId, avisada, NotificationKindEnum.Assignment);

        return Detail(card, null, null, canAskInfo: false, [], AllowsReportArchiving(regras),
            await TeamIdsForAsync([card], cancellationToken),
            await FaceOfAsync(card, cancellationToken));
    }

    public async Task<ReportDetailViewModel> EditTeamCardAsync(Guid projectPublicId, Guid reportPublicId, EditTeamCardDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        // **A conferencia do `Base` e a gravacao, sob a trava dos campos do card.** Sem
        // ela, duas pessoas que partiram do mesmo texto conferiam ao mesmo tempo, as
        // duas passavam, e a segunda gravava por cima da primeira — justamente o que o
        // `Base` existe para impedir. Com ela, a segunda espera a primeira gravar, le o
        // texto novo e recebe o 409. A mesma trava das rotas de campo: o titulo pela
        // rota de titulo tambem espera.
        var card = await _unitOfWork.InTransactionAsync(async ct =>
        {
            await _unitOfWork.Reports.LockCardFieldsAsync(project.Id, reportPublicId, ct);

            var atual = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, ct)
                ?? throw new KeyNotFoundException("Card nao encontrado.");

            // O texto do relato e de quem relatou, e o que ela escreveu fica como ela
            // escreveu.
            if (atual.Kind != CardKindEnum.Team)
                throw new ConflictException("O texto do relato e de quem relatou: o time nao o reescreve.");

            EnsureNotArchived(atual, "edita-lo");

            // **De onde a edicao partiu.** Outra pessoa salvou o titulo ou a descricao
            // enquanto esta escrevia: gravar por cima apagaria o texto dela em silencio. O
            // texto, e nao a data do card — a data muda com a prioridade, a coluna, a
            // etiqueta, e isso nao se perde.
            if (dto.Base is not null && !MesmoTexto(atual, dto.Base))
                throw new ConflictException("Outra pessoa salvou este card enquanto voce editava. Leia a versao nova antes de salvar.");

            var titulo = RequireTitle(dto.Title);
            var descricao = NormalizeDescription(dto.Description);

            var mudou = new List<string>();
            if (atual.Title != titulo)
                mudou.Add("title");
            if (atual.Description != descricao)
                mudou.Add("description");

            // Gravar o mesmo texto nao e edicao: o historico ganharia uma linha que nao
            // diz nada.
            if (mudou.Count > 0)
            {
                atual.Title = titulo;
                atual.Description = descricao;

                await _unitOfWork.Events.AddAsync(new Event
                {
                    AccountId = project.AccountId,
                    ProjectId = project.Id,
                    ReportId = atual.Id,
                    UserId = _accountContext.UserId,
                    Type = EventTypeEnum.TeamCardEdited,
                    Source = EventSourceEnum.Panel,
                    Payload = JsonSerializer.Serialize(new
                    {
                        fields = mudou,
                        description_length = descricao?.Length ?? 0,
                    }),
                }, ct);

                await _unitOfWork.CommitAsync(ct);
            }

            return atual;
        }, cancellationToken);

        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);

        await _notifier.CardChangedAsync(card.PublicId);

        return Detail(card, null, null, canAskInfo: false, [], AllowsReportArchiving(regras),
            await TeamIdsForAsync([card], cancellationToken),
            await FaceOfAsync(card, cancellationToken));
    }

    /// <summary>
    /// O pai da subtarefa que vai nascer. Tem de ser do projeto, estar fora do arquivo e
    /// nao ser subtarefa — um nivel so: mais fundo, o pai deixa de mostrar o que falta.
    /// Com pai, a coluna nao se escolhe — a subtarefa nasce na primeira —, nem o
    /// responsavel nem a prioridade: ela nasce sem os dois.
    /// </summary>
    private async Task<Report?> ResolveParentAsync(long projectId, CreateTeamCardDto dto, CancellationToken cancellationToken)
    {
        if (dto.ParentPublicId is not Guid paiPublicId)
            return null;

        if (dto.StatePublicId is not null)
            throw new ArgumentException("A subtarefa nasce na primeira coluna: nao escolha a coluna.");

        // Sem responsavel, porque quem a pega e quem a faz; e sem prioridade, como sempre
        // nasceu. Recusar, e nao ignorar: quem mandou saberia so depois que nao entrou.
        if (dto.AssigneeUserPublicId is not null)
            throw new ArgumentException("A subtarefa nasce sem responsavel: nao escolha o responsavel.");

        if (dto.PriorityPublicId is not null)
            throw new ArgumentException("A subtarefa nasce sem prioridade: nao escolha a prioridade.");

        var pai = await _unitOfWork.Reports.FindParentAsync(projectId, paiPublicId, cancellationToken)
                  ?? throw new KeyNotFoundException("O card pai nao foi encontrado neste projeto.");

        if (pai.ParentReportId is not null)
            throw new ConflictException("Subtarefa nao tem subtarefa: crie no card pai.");

        if (pai.ArchivedAt is not null)
            throw new ConflictException("O card pai esta arquivado. Desarquive antes de criar subtarefa.");

        return pai;
    }

    public async Task<ReportDetailViewModel> SetArchivedAsync(Guid projectPublicId, Guid reportPublicId, ArchiveCardDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
            ?? throw new KeyNotFoundException("Card nao encontrado.");

        var arquivar = dto.Archived
                       ?? throw new ArgumentException("Diga se o card vai para o arquivo ou sai dele.");

        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);

        // Pedir o que ja e verdade nao e erro — e a segunda aba, ou o segundo clique.
        // Vem antes de olhar desfecho e motivo: a segunda aba manda os que escreveu,
        // e o relato ja saiu arquivado, e encerrado, pela primeira.
        if (arquivar == (report.ArchivedAt is not null))
            return await DetailOfAsync(report, regras, cancellationToken);

        var relato = report.Kind == CardKindEnum.Report;
        var fechamento = relato
            ? await _unitOfWork.ReportClosures.FindCurrentAsync(report.Id, cancellationToken)
            : null;
        var motivo = (dto.Reason ?? string.Empty).Trim();

        // Encerra junto so o relato aberto, e so ao arquivar.
        var encerra = arquivar && relato && fechamento is null;

        if (!encerra && (dto.Outcome is not null || motivo.Length > 0))
        {
            // Recusado, e nao ignorado: um motivo aceito aqui seria gravado sem ter
            // onde morar, e quem escreveu acharia que quem relatou vai le-lo.
            throw new ArgumentException(arquivar
                ? "Arquivar este card nao encerra nada, entao nao leva desfecho nem motivo."
                : "Desarquivar nao leva desfecho nem motivo.");
        }

        if (arquivar && relato && !AllowsReportArchiving(regras))
            throw new ForbiddenException("Este projeto nao arquiva relato. O caminho do relato e encerrar com desfecho.");

        // A subtarefa nao volta sozinha enquanto o pai esta arquivado: voltaria ao
        // trabalho dentro de um card que ninguem ve.
        if (!arquivar && report.ParentReportId is long paiId
            && (await _unitOfWork.Reports.GetByIdAsync(paiId, cancellationToken))?.ArchivedAt is not null)
            throw new ConflictException("O card pai esta arquivado. Desarquive o pai, e as subtarefas que foram com ele voltam junto.");

        if (encerra)
        {
            if (dto.Outcome is null)
                throw new ArgumentException("Informe o desfecho. Arquivar um relato aberto encerra o relato junto.");

            // **Arquivar nunca deixa quem relatou sem retorno.** O motivo e o que ela
            // le pelo link — e e a partir dele que ela reabre ou finaliza.
            if (motivo.Length == 0)
                throw new ArgumentException("Escreva o motivo. E o que quem relatou vai ler, e a partir dele pode reabrir ou finalizar.");

            if (motivo.Length > ReportClosure.MaxReasonLength)
                throw new ArgumentException($"O motivo pode ter ate {ReportClosure.MaxReasonLength} caracteres.");

            // Sem esperar, como o encerramento por botao: houve um dialogo, um
            // desfecho escolhido e um motivo escrito — nao ha engano a desfazer.
            await RegisterClosureAsync(project, report, dto.Outcome.Value, motivo, DateTime.UtcNow, cancellationToken);
        }

        // **Desarquivar o duplicado desfaz o vinculo**: de volta ao quadro, ele deixa de
        // ser duplicado. O original fica sabendo pelo evento dele.
        Guid? original = null;
        if (!arquivar && await _unitOfWork.CardLinks.FindOriginalLinkWithoutSessionAsync(report.Id, cancellationToken) is { } vinculo)
        {
            await _unitOfWork.CardLinks.SoftDeleteAsync(vinculo, cancellationToken);
            await AddLinkEventAsync(project, report, EventTypeEnum.CardUnlinked, "duplicate_of", vinculo.ToReport, EventSourceEnum.Panel, cancellationToken);
            await AddLinkEventAsync(project, vinculo.ToReport, EventTypeEnum.CardUnlinked, "duplicated_by", report, EventSourceEnum.Panel, cancellationToken);
            original = vinculo.ToReport.PublicId;
        }

        // **As subtarefas vao junto, e voltam junto** — com o mesmo instante no arquivo.
        // E ele que separa, na volta, as que foram com o pai das que ja estavam la.
        var subtarefas = await SetArchivedWithSubtasksAsync(
            project, report, arquivar, EventSourceEnum.Panel, new { closed = encerra }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.CardChangedAsync(report.PublicId);
        foreach (var subtarefa in subtarefas)
            await _notifier.CardChangedAsync(subtarefa.PublicId);
        if (original is Guid doOriginal)
            await _notifier.CardChangedAsync(doOriginal);

        return await DetailOfAsync(report, regras, cancellationToken);
    }

    /// <summary>
    /// O detalhe depois de uma acao, sem gravar leitura — abrir grava, e a acao nao
    /// e uma leitura.
    /// </summary>
    private async Task<ReportDetailViewModel> DetailOfAsync(Report report, ProjectCycleSettings? regras, CancellationToken cancellationToken)
    {
        if (report.Kind == CardKindEnum.Team)
            return Detail(report, null, null, canAskInfo: false, [], AllowsReportArchiving(regras),
            await TeamIdsForAsync([report], cancellationToken),
            await FaceOfAsync(report, cancellationToken));

        var fechamento = await _unitOfWork.ReportClosures.FindCurrentAsync(report.Id, cancellationToken);
        var pedido = await _unitOfWork.ReportInfoRequests.FindOpenAsync(report.Id, cancellationToken);

        return Detail(report, ClosureOf(fechamento), InfoRequestOf(pedido), CanAskInfo(report, regras, fechamento, pedido),
            await ReopeningsOfAsync(report.Id, cancellationToken), AllowsReportArchiving(regras),
            await TeamIdsForAsync([report], cancellationToken),
            await FaceOfAsync(report, cancellationToken));
    }

    /// <summary>
    /// Se o time pode pedir informacao a quem relatou, agora.
    ///
    /// <para><b>A conclusao, e nao a configuracao.</b> Todas as condicoes precisam ser
    /// verdade ao mesmo tempo, e a tela nao tem por que saber quais — ela le uma
    /// resposta so e decide se oferece o botao.</para>
    ///
    /// <para><b>Vale para abrir e para toda acao que devolve o card aberto.</b> A tela
    /// troca o que tem pela resposta: um "nao pode" fixo ali tiraria o botao da tela
    /// depois de mudar a prioridade, ate alguem fechar e abrir o card de novo.</para>
    /// </summary>
    private static bool CanAskInfo(Report report, ProjectCycleSettings? regras, ReportClosure? fechamento, ReportInfoRequest? pedido)
        => (regras?.InfoRequestEnabled ?? CycleSettingsDefaults.InfoRequestEnabled)
           && report.Kind == CardKindEnum.Report
           && report.ArchivedAt is null
           && report.AcceptsQuestions == true
           && fechamento is null
           && pedido is null;

    /// <summary>O titulo do card do time, numa linha e obrigatorio.</summary>
    private static string RequireTitle(string? value)
        => CardText.Title(value) ?? throw new ArgumentException("De um titulo ao card.");

    /// <summary>
    /// A descricao como veio, menos as bordas em branco. <b>Vazia vira nula</b>: um
    /// card sem descricao e um card sem descricao, e nao um card com descricao vazia.
    /// O Markdown nao e lido aqui — quem desenha e o painel, sem HTML.
    /// </summary>
    private static string? NormalizeDescription(string? value)
    {
        var descricao = (value ?? string.Empty).Trim();

        if (descricao.Length > Report.MaxDescriptionLength)
            throw new ArgumentException($"A descricao pode ter ate {Report.MaxDescriptionLength} caracteres.");

        return descricao.Length == 0 ? null : descricao.Replace("\r\n", "\n");
    }

    /// <summary>
    /// Se o card ainda tem o titulo e a descricao de onde a edicao partiu. A tela manda
    /// o que leu da API, ja arrumado; o arrumar daqui e so o das bordas e da quebra de
    /// linha, sem recusar o tamanho — quem conferiu o tamanho foi a gravacao anterior.
    /// </summary>
    private static bool MesmoTexto(Report card, TeamCardTextDto lido)
    {
        var titulo = (lido.Title ?? string.Empty).Trim();
        var descricao = (lido.Description ?? string.Empty).Trim().Replace("\r\n", "\n");

        return (card.Title ?? string.Empty) == titulo
               && (card.Description ?? string.Empty) == descricao;
    }

    /// <summary>
    /// O estado em que o card do time nasce. Escolhido, tem de ser deste projeto e
    /// estar ativo; sem escolha, o primeiro ativo — e nenhum, se o projeto ainda nao
    /// tem estado, como acontece com o relato.
    /// </summary>
    private async Task<ProjectState?> ResolveTeamCardStateAsync(long projectId, Guid? statePublicId, CancellationToken cancellationToken)
    {
        if (statePublicId is Guid escolhido)
        {
            var estado = await _unitOfWork.ProjectStates.GetByPublicIdAsync(escolhido, cancellationToken);

            if (estado is null || estado.ProjectId != projectId)
                throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

            if (!estado.IsActive)
                throw new ConflictException("Este estado esta aposentado e nao recebe card novo.");

            return estado;
        }

        return (await _unitOfWork.ProjectStates.ListByProjectAsync(projectId, cancellationToken))
            .Where(estado => estado.IsActive)
            .OrderBy(estado => estado.Position)
            .ThenBy(estado => estado.Id)
            .FirstOrDefault();
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

        EnsureNotArchived(report, "move-lo");

        // **O card do time nao encerra nem anda la fora.** Nao ha quem relatou para
        // ler desfecho, nem jornada para mostrar: a ultima coluna e so a ultima
        // coluna, e a etapa publica nunca se mexe por ele.
        var doTime = report.Kind == CardKindEnum.Team;

        var destino = await _unitOfWork.ProjectStates.GetByPublicIdAsync(dto.StatePublicId.Value, cancellationToken);

        if (destino is null || destino.ProjectId != project.Id)
            throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

        if (!destino.IsActive)
            throw new ConflictException("Este estado esta aposentado e nao recebe relato novo.");

        // Mover para onde ja esta nao e erro, e so nao ter o que fazer. Gravar
        // assim mesmo encheria o historico de linhas que nao dizem nada, e a
        // contagem da pesquisa passaria a medir cliques em vez de movimentos.
        if (report.ProjectStateId == destino.Id)
            return Map(report, await TeamIdsForAsync([report], cancellationToken), await FaceOfAsync(report, cancellationToken));

        // **A conferencia do encerramento vem antes de qualquer gravacao.** Ela nao
        // depende da traducao — quem encerra e a coluna de dentro, e nao a etapa
        // publica —, entao nao ha motivo para o relato andar meio caminho e so
        // entao esbarrar num campo em branco.
        // **Nem todo projeto encerra movendo.** Quem escolheu o botao nao tem coluna
        // que encerre: ali o movimento e so movimento, e pedir motivo nele seria
        // cobrar por uma decisao que ninguem tomou.
        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);
        var gatilho = regras?.ClosureTrigger ?? CycleSettingsDefaults.ClosureTrigger;

        var ultimaAtiva = gatilho == ClosureTriggerEnum.LastColumn && !doTime
            ? await _unitOfWork.ProjectStates.LastActiveAsync(project.Id, cancellationToken)
            : null;

        var paraAQueEncerra = ultimaAtiva is not null && ultimaAtiva.Id == destino.Id;

        // **Ja encerrado nao encerra de novo**, como no botao. Chega a coluna que
        // encerra com um fechamento valendo o relato que o arquivo encerrou e o time
        // desarquivou, ou o que quem relatou ja confirmou: ali ele so anda. Um
        // segundo fechamento deixaria o primeiro valendo por baixo, e reabrir faria
        // a pagina de quem relatou voltar a ele.
        var encerra = paraAQueEncerra
            && await _unitOfWork.ReportClosures.FindCurrentAsync(report.Id, cancellationToken) is null;
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

        // E o cache depois. Sem gravar a linha inteira: o card ja e acompanhado, e o
        // commit leva so o que mudou. A linha inteira devolveria o titulo, ou o
        // arquivamento, lidos antes de outra pessoa mudar.
        report.ProjectStateId = destino.Id;
        report.ProjectState = destino;
        report.StateChangedAt = DateTime.UtcNow;

        // **A espera decide se a jornada anda agora ou depois.** Zero e o
        // comportamento de sempre: a traducao acontece junto do movimento. Acima de
        // zero, o lado de fora nao muda nada aqui — so fica marcada a hora de olhar
        // de novo, e a janela ate la e o que permite desfazer um movimento errado
        // antes de a pessoa ver.
        var espera = regras?.PublicDelayMinutes ?? CycleSettingsDefaults.PublicDelayMinutes;

        if (doTime)
        {
            // Nada la fora: nem traducao, nem espera. O movimento termina aqui.
        }
        else if (espera <= 0)
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
        else if (gatilho == ClosureTriggerEnum.LastColumn && !doTime && !paraAQueEncerra)
        {
            // **Sair da coluna que encerra desfaz o encerramento**, e so neste
            // gatilho. Sem isto, desfazer um movimento errado devolvia o relato para
            // a fila e o deixava encerrado — a pessoa continuava lendo "acabou"
            // sobre um relato que o time voltou a trabalhar.
            //
            // No gatilho por botao nao se faz nada: la o fechamento nasceu de uma
            // decisao propria, e mover o relato e so mover. Nem chegar a coluna que
            // encerra com o fechamento valendo: ali e onde ele mora.
            await CancelClosureAsync(project, report, cancellationToken);
        }

        // O lugar na coluna nova entra na mesma gravacao: logo abaixo do card que o
        // quadro mandou, ou no topo.
        await SaveInPlaceAsync(project.Id, report, destino.Id, dto.AfterPublicId, cancellationToken);

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

        await _notifier.CardChangedAsync(report.PublicId);

        return Map(report, await TeamIdsForAsync([report], cancellationToken), await FaceOfAsync(report, cancellationToken));
    }

    public async Task<ReportSummaryViewModel> SetPositionAsync(Guid projectPublicId, Guid reportPublicId, SetCardPositionDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
                     ?? throw new KeyNotFoundException("Card nao encontrado.");

        // O arquivado esta fora do quadro: muda-lo de lugar seria arrumar o que
        // ninguem ve.
        EnsureNotArchived(report, "muda-lo de lugar no quadro");

        // Sem evento, de proposito: ver a interface. Na mesma coluna em que esta —
        // trocar de coluna e mover, e mover tem a sua rota. Com a ordem travada, o card
        // e relido: outra pessoa pode te-lo movido ou arquivado depois da leitura de
        // cima, e o lugar seria contado numa coluna em que ele ja nao esta.
        await _unitOfWork.InTransactionAsync(async ct =>
        {
            await _unitOfWork.Reports.LockBoardAsync(project.Id, ct);

            var aqui = await _unitOfWork.Reports.FindBoardSpotAsync(project.Id, report.PublicId, ct)
                       ?? throw new KeyNotFoundException("Card nao encontrado.");
            if (aqui.StateId != report.ProjectStateId || aqui.Archived)
                throw new ConflictException("O card mudou de coluna ou saiu do quadro. Atualize o quadro e solte de novo.");

            report.BoardRank = dto.AfterPublicId is Guid acima
                ? await RankBelowAsync(project.Id, report.ProjectStateId, acima, report.Id, ct)
                : await _unitOfWork.Projects.NextTopRankAsync(project.Id, ct);
            await _unitOfWork.CommitAsync(ct);
            return true;
        }, cancellationToken);

        await _notifier.CardChangedAsync(report.PublicId);

        return Map(report, await TeamIdsForAsync([report], cancellationToken), await FaceOfAsync(report, cancellationToken));
    }

    /// <summary>
    /// Grava o que esta pendente com o card no lugar pedido da coluna: logo abaixo de
    /// <paramref name="afterPublicId"/>, ou no topo.
    ///
    /// <para><b>O topo nao trava nada</b>: vem do contador do projeto, que ja fica
    /// acima de tudo. <b>Entre dois trava a ordem do quadro</b>, porque precisa ler
    /// os vizinhos — e a leitura, a conta e a gravacao vao juntas.</para>
    /// </summary>
    private async Task SaveInPlaceAsync(long projectId, Report report, long? stateId, Guid? afterPublicId, CancellationToken cancellationToken)
    {
        if (afterPublicId is not Guid acima)
        {
            report.BoardRank = await _unitOfWork.Projects.NextTopRankAsync(projectId, cancellationToken);
            await _unitOfWork.CommitAsync(cancellationToken);
            return;
        }

        await _unitOfWork.InTransactionAsync(async ct =>
        {
            await _unitOfWork.Reports.LockBoardAsync(projectId, ct);
            report.BoardRank = await RankBelowAsync(projectId, stateId, acima, report.Id, ct);
            await _unitOfWork.CommitAsync(ct);
            return true;
        }, cancellationToken);
    }

    /// <summary>
    /// O lugar logo abaixo do card de referencia: o meio entre ele e o vizinho de
    /// baixo, ou uma folga abaixo dele quando nao ha vizinho. Sem folga no meio, a
    /// coluna e renumerada e a conta e refeita.
    ///
    /// <para><b>A referencia precisa estar na coluna, e no quadro.</b> A tela que
    /// mandou pode estar velha — outra pessoa moveu ou arquivou o card de cima — e
    /// por o card ao lado de um que ja nao esta ali o deixaria num lugar que ninguem
    /// escolheu.</para>
    /// </summary>
    private async Task<long> RankBelowAsync(long projectId, long? stateId, Guid acima, long movingId, CancellationToken cancellationToken)
    {
        var referencia = await _unitOfWork.Reports.FindBoardSpotAsync(projectId, acima, cancellationToken)
                         ?? throw new KeyNotFoundException("O card de referencia nao foi encontrado neste projeto.");

        if (referencia.Id == movingId)
            throw new ArgumentException("O card nao fica abaixo dele mesmo.");

        if (referencia.StateId != stateId || referencia.Archived)
            throw new ConflictException("O card de referencia nao esta mais nesta coluna. Atualize o quadro e solte de novo.");

        var abaixo = await _unitOfWork.Reports.FindRankBelowAsync(projectId, stateId, referencia.Rank, referencia.Id, movingId, cancellationToken);

        if (abaixo is null)
            return referencia.Rank + Report.BoardRankGap;

        if (abaixo.Value - referencia.Rank >= 2)
            return referencia.Rank + (abaixo.Value - referencia.Rank) / 2;

        // Sem folga: a coluna ganha a folga inteira de novo, na ordem em que esta, e
        // a conta e refeita com os lugares novos.
        await _unitOfWork.Reports.RenumberColumnAsync(projectId, stateId, movingId, cancellationToken);

        referencia = await _unitOfWork.Reports.FindBoardSpotAsync(projectId, acima, cancellationToken)
                     ?? throw new KeyNotFoundException("O card de referencia nao foi encontrado neste projeto.");
        abaixo = await _unitOfWork.Reports.FindRankBelowAsync(projectId, stateId, referencia.Rank, referencia.Id, movingId, cancellationToken);

        return abaixo is long vizinho
            ? referencia.Rank + (vizinho - referencia.Rank) / 2
            : referencia.Rank + Report.BoardRankGap;
    }

    /// <summary>Os numeros da frente de um card so.</summary>
    private async Task<CardFace> FaceOfAsync(Report report, CancellationToken cancellationToken)
        => (await _unitOfWork.Reports.CountFacesAsync([report.Id], cancellationToken))
            .GetValueOrDefault(report.Id, CardFace.Empty);

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

        // O encerramento e o que quem relatou le. O card do time termina movendo
        // para a ultima coluna: nao ha ninguem do lado de fora para ler desfecho.
        if (report.Kind == CardKindEnum.Team)
            throw new ConflictException("O card do time nao tem quem relatou para ler o desfecho: ele termina na ultima coluna.");

        EnsureNotArchived(report, "encerra-lo");

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
        await _notifier.CardChangedAsync(report.PublicId);

        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);

        // **Sem gravar leitura.** Esta resposta e a mesma forma do detalhe porque a
        // tela ja esta com o relato aberto e so precisa dele atualizado; passar
        // por `GetAsync` como numa abertura registraria uma segunda visualizacao que
        // ninguem fez. Encerrado: nao ha mais o que perguntar, e um pedido aberto
        // deixou de fazer sentido — mas quem o fecha e o prazo dele, nao este caminho.
        return Detail(report, ClosureOf(fechamento), null, canAskInfo: false,
            await ReopeningsOfAsync(report.Id, cancellationToken), AllowsReportArchiving(regras),
            await TeamIdsForAsync([report], cancellationToken),
            await FaceOfAsync(report, cancellationToken));
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
        // abrir o detalhe de novo — abrir **grava** um evento de leitura.
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

        // Os relatos duplicados deste recebem o mesmo desfecho e o mesmo motivo.
        await CopyClosureToDuplicatesAsync(project, report, fechamento, cancellationToken);

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

        await WithdrawCopiedClosuresAsync(project, report, fechamento, EventSourceEnum.Panel, _accountContext.UserId, cancellationToken);
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
            await _unitOfWork.CommitAsync(cancellationToken);
            await _notifier.CardChangedAsync(report.PublicId);
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

        await _unitOfWork.CommitAsync(cancellationToken);
        await _notifier.CardChangedAsync(report.PublicId);
    }

    public Task<IReadOnlyList<Guid>> ListOverdueScheduledAsync(CancellationToken cancellationToken = default)
        => _unitOfWork.Reports.ListOverduePublicStageWithoutSessionAsync(DateTime.UtcNow, cancellationToken);

    public async Task<IReadOnlyList<ReportHistoryEntryViewModel>> HistoryAsync(Guid projectPublicId, Guid reportPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
            ?? throw new KeyNotFoundException("Relato nao encontrado.");

        var events = await _unitOfWork.Events.ListByReportAsync(report.Id, cancellationToken);
        var mudancas = events.Select(CardChange.Read).ToList();

        // Quem passou pelo card aparece com o nome de agora, numa consulta so: o evento
        // guarda so o identificador — nome e dado de alguem, e esta tabela nao se apaga.
        var pessoas = mudancas
            .SelectMany(mudanca => new[] { mudanca.FromPerson, mudanca.ToPerson })
            .OfType<Guid>()
            .Distinct()
            .ToList();
        var nomes = pessoas.Count == 0
            ? new Dictionary<Guid, string>()
            : (await _unitOfWork.Users.ListByPublicIdsAsync(pessoas, cancellationToken))
                .ToDictionary(pessoa => pessoa.PublicId, PersonName);

        return events.Select((entity, indice) =>
        {
            var (de, para) = StateNames(entity);
            var mudanca = mudancas[indice];

            return new ReportHistoryEntryViewModel(
                entity.PublicId,
                entity.Type,
                entity.User?.Name,
                de,
                para,
                entity.OccurredAt,
                // Havia alguem, ha sempre um texto: nulo, na mudanca de responsavel, e
                // "ficou sem ninguem" — e a pessoa sem nome nao pode virar ninguem.
                mudanca.FromPerson is Guid antes ? nomes.GetValueOrDefault(antes, string.Empty) : mudanca.From,
                mudanca.ToPerson is Guid depois ? nomes.GetValueOrDefault(depois, string.Empty) : mudanca.To,
                mudanca.Added,
                mudanca.Removed,
                mudanca.TitleRestored);
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

        // E os relatos duplicados deste andam com ele: quem os escreveu acompanha o original.
        await FollowStageOfDuplicatesAsync(project, report, etapaDestino, etapaPorId, source, userId, cancellationToken);

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
    /// <para>Primeiro a coluna que o tipo escolheu; sem escolha, o primeiro estado
    /// ativo da fila. <b>Sem estado nenhum devolve nulo</b>, e o relato entra sem
    /// lugar — recusa-lo seria perder o que veio de fora por uma configuracao que o
    /// cliente nao fez, e quem escreveu nao tem nada a ver com isso.</para>
    ///
    /// <para>O tipo ja chegou lido sem sessao, e a busca do primeiro estado tambem
    /// desliga o filtro global: aqui a lista de projetos acessiveis esta vazia, e sem
    /// isso todo relato cairia sem lugar, sem erro em lugar nenhum.</para>
    ///
    /// <para>O estado escolhido nao precisa ser conferido de novo: aposentar um
    /// estado que e entrada de algum tipo e recusado, entao ele nao tem como estar
    /// aposentado aqui.</para>
    /// </summary>
    private async Task<long?> ResolveLandingStateAsync(long projectId, ProjectReportType reportType, CancellationToken cancellationToken)
    {
        if (reportType.InitialStateId is long chosen)
            return chosen;

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

    public async Task<ModerationQueueViewModel> ListModerationAsync(Guid projectPublicId, ReportModerationStateEnum state, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var relatos = await _unitOfWork.Reports
            .ListByModerationStateAsync(project.Id, state, ModerationPageSize, cancellationToken);

        // O total dos pendentes viaja sempre, e nao so quando o recorte e "pendente":
        // e o numero da lateral do painel, e ele nao pode sumir porque alguem abriu
        // a aba dos ja decididos.
        var pendentes = await _unitOfWork.Reports
            .CountByModerationStateAsync(project.Id, ReportModerationStateEnum.Pending, cancellationToken);

        return new ModerationQueueViewModel([.. relatos.Select(ToModerationItem)], pendentes);
    }

    public async Task<ModerationItemViewModel> ModerateAsync(Guid projectPublicId, Guid reportPublicId, ModerateReportDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        var decisao = dto.Decision
                      ?? throw new ArgumentException("Informe se o relato vai ou nao para o publico.");

        // **Pendente nao e decisao.** Aceitar "voltar para a fila" apagaria a
        // leitura de outra pessoa e faria a fila cobrar de novo um relato que ja
        // tinha sido lido.
        if (decisao == ReportModerationStateEnum.Pending)
            throw new ArgumentException("Nao da para devolver um relato para a fila: alguem ja o leu.");

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(project.Id, reportPublicId, cancellationToken)
                     ?? throw new KeyNotFoundException("Relato nao encontrado neste projeto.");

        // A moderacao decide o que gente de fora le — e o card do time nunca vai
        // para fora. Para a fila, ele nao existe; e o banco recusaria liberar.
        if (report.Kind == CardKindEnum.Team)
            throw new KeyNotFoundException("Relato nao encontrado neste projeto.");

        var anterior = report.ModerationState;

        // O autor vem do banco pelo mesmo motivo do encerramento: a sessao guarda o
        // identificador e nao o nome, e a resposta desta acao precisa do nome. Sem
        // ele, a tela desenharia "liberado" sem dizer por quem — logo depois de a
        // propria pessoa ter liberado.
        var autor = _accountContext.UserId is long userId
            ? await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken)
            : null;

        report.ModerationState = decisao;
        report.ModeratedAt = DateTime.UtcNow;
        report.ModeratedByUserId = autor?.Id;
        report.ModeratedByUser = autor;

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            ReportId = report.Id,
            UserId = _accountContext.UserId,
            Type = decisao == ReportModerationStateEnum.Approved
                ? EventTypeEnum.ReportPublished
                : EventTypeEnum.ReportModerationRejected,
            Source = EventSourceEnum.Panel,
            Payload = JsonSerializer.Serialize(new
            {
                // De onde veio a decisao. Sem isto, liberar e **re**liberar depois
                // de uma recusa contariam como a mesma coisa — e a segunda e a que
                // diz que a primeira leitura estava errada.
                from = anterior.ToString(),
                // Quanto o relato esperou na fila. Fila que demora nao e detalhe de
                // operacao: enquanto ela demora, quem relatou ve a promessa de
                // aparecer e nao aparece.
                waited_minutes = (int)(DateTime.UtcNow - report.CreatedAt).TotalMinutes,
            }),
        }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        await _notifier.CardChangedAsync(report.PublicId);

        return ToModerationItem(report);
    }

    public async Task<PublishedReportsViewModel> ListPublishedAsync(PublishedReportsDto dto, CancellationToken cancellationToken = default)
    {
        var vazia = new PublishedReportsViewModel([], false);

        var project = await RequireProjectAsync(dto.Key, cancellationToken);

        var identidade = await _unitOfWork.ProjectIdentitySettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        var visibilidade = identidade?.Visibility ?? IdentitySettingsDefaults.Visibility;

        // **Projeto privado responde vazio, e nao uma recusa.** Recusar contaria a
        // configuracao do cliente a qualquer um que tivesse a chave publica — que e
        // publica de proposito e esta no codigo-fonte da pagina dele.
        if (visibilidade == ReportVisibilityEnum.Private)
            return vazia;

        var encontrados = await _unitOfWork.Reports
            .ListPublishedWithoutSessionAsync(project.Id, Report.MaxPublishedListed + 1, cancellationToken);

        var temMais = encontrados.Count > Report.MaxPublishedListed;
        var relatos = temMais
            ? encontrados.Take(Report.MaxPublishedListed).ToList()
            : encontrados;

        var fechados = (await _unitOfWork.ReportClosures
                .ListReportIdsWithPublicClosureWithoutSessionAsync(
                    [.. relatos.Select(relato => relato.Id)], DateTime.UtcNow, cancellationToken))
            .ToHashSet();

        // **As duas condicoes do nome, juntas.** A regra mora aqui e nao na tela:
        // uma tela pode esquecer de conferir, e o que estaria em jogo e o nome de
        // uma pessoa ao lado de um texto que qualquer um le.
        var mostraNome = visibilidade == ReportVisibilityEnum.PublicIdentified;

        return new PublishedReportsViewModel(
            [.. relatos.Select(relato => new PublishedReportViewModel(
                relato.ReporterFields().Type.Name,
                relato.ReporterFields().Text,
                relato.ProjectPublicStage?.Label,
                fechados.Contains(relato.Id),
                mostraNome && relato.ReporterNameIsPublic ? relato.ReporterName : null,
                // Liberado tem data de liberacao: a consulta so traz aprovado, e
                // aprovado sem data nao existe.
                relato.ModeratedAt ?? relato.CreatedAt))],
            temMais);
    }

    /// <summary>
    /// A linha da fila, como o painel a le.
    /// </summary>
    private static ModerationItemViewModel ToModerationItem(Report report)
    {
        var (protocolo, tipo, texto) = report.ReporterFields();
        var achados = SensitiveDataScanner.Scan(texto);

        return new ModerationItemViewModel(
            report.PublicId,
            protocolo,
            CardTypeOf(tipo),
            texto,
            report.ReporterName,
            report.ReporterNameIsPublic,
            report.ModerationState,
            report.ModeratedAt,
            report.ModeratedByUser?.Name,
            report.CreatedAt,
            // **A varredura roda aqui**, na leitura da fila: antes de publicar, e
            // nunca depois. Sinaliza e para por ai — bloquear faria cada falso
            // positivo virar um relato perdido, e perdido para quem escreveu.
            [.. achados.Select(achado => new SensitiveFindingViewModel(
                achado.Kind, achado.Start, achado.Length, achado.Sample))],
            achados.Count >= SensitiveDataScanner.MaxFindings);
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
                    relato.ReporterFields().TrackingCode,
                    relato.ReporterFields().Type.Name,
                    relato.ReporterTitle,
                    Excerpt(relato.ReporterFields().Text),
                    relato.ProjectPublicStage?.Label,
                    fechados.Contains(relato.Id),
                    relato.CreatedAt))
                .ToList(),
            temMais);
    }

    public async Task<PublicReportViewModel> OpenByReporterCodeAsync(OpenByReporterCodeDto dto, CancellationToken cancellationToken = default)
    {
        // A mesma porta da leitura dos arquivos pelo codigo: chave, codigo e
        // protocolo, com uma recusa so. Ver ReporterCodeGate.
        var report = await ReporterCodeGate.RequireAsync(
            _unitOfWork, dto.Key, dto.Code, dto.TrackingCode, cancellationToken);

        var regras = await _unitOfWork.ProjectCycleSettings
            .FindByProjectWithoutSessionAsync(report.ProjectId, cancellationToken);

        // **E aqui que a regra do codigo sozinho decide — quando puder.** Enquanto
        // confirmar, reabrir e responder so aceitarem o token, obedecer ao valor
        // gravado mostraria botoes que a propria API recusa; entao ele fica gravado e
        // e ignorado. O que falta para voltar esta em ActionsAcceptReporterCode.
        var podeAgir = ActionsAcceptReporterCode
            && (regras?.TrackingCodeCanAct ?? CycleSettingsDefaults.TrackingCodeCanAct);

        await _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = report.AccountId,
            ProjectId = report.ProjectId,
            ReportId = report.Id,
            Type = EventTypeEnum.ReportViewed,
            Source = EventSourceEnum.PublicPage,
            // A carga diz **por onde** ela entrou. Sem isto, a lista pessoal e o
            // link ficariam indistinguiveis na contagem — e saber se as pessoas
            // voltam pela lista ou pelo link e o que diz se a lista serviu.
            Payload = JsonSerializer.Serialize(new { by = "reporter_code" }),
        }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        return await BuildPublicAsync(report, podeAgir, cancellationToken);
    }

    /// <summary>
    /// O comeco do relato, para a pessoa distinguir um do outro na lista.
    ///
    /// <para><b>Corta em palavra, e nao no meio de uma.</b> "O botao de finaliz…"
    /// obriga a abrir para saber o que era, que e o oposto do que a lista serve.</para>
    /// </summary>
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

    public async Task<ReportDetailViewModel> GetAsync(Guid projectPublicId, Guid reportPublicId, bool recordView = true, CancellationToken cancellationToken = default)
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
        //
        // **So no relato.** O evento mede quanto o time demora a olhar o que veio de
        // fora; o card do time nasceu dentro, e a leitura dele so mediria cliques.
        //
        // **E so ao abrir.** A releitura do card que ja esta aberto, por causa de um
        // aviso em tempo real, nao e alguem indo olhar: a leitura ja foi contada.
        if (report.Kind == CardKindEnum.Report && recordView)
        {
            await _unitOfWork.Events.AddAsync(new Event
            {
                AccountId = project.AccountId,
                ProjectId = project.Id,
                ReportId = report.Id,
                Type = EventTypeEnum.ReportViewed,
                Source = EventSourceEnum.Panel,
            }, cancellationToken);
        }

        var fechamento = await _unitOfWork.ReportClosures.FindCurrentAsync(report.Id, cancellationToken);
        var pedido = await _unitOfWork.ReportInfoRequests.FindOpenAsync(report.Id, cancellationToken);
        var regras = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);
        var reaberturas = await ReopeningsOfAsync(report.Id, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        return Detail(report, ClosureOf(fechamento), InfoRequestOf(pedido), CanAskInfo(report, regras, fechamento, pedido),
            reaberturas, AllowsReportArchiving(regras),
            await TeamIdsForAsync([report], cancellationToken),
            await FaceOfAsync(report, cancellationToken));
    }

    /// <summary>
    /// O relato aberto, campo a campo.
    ///
    /// <para>Existe porque <b>duas</b> acoes devolvem esta forma: abrir o relato e
    /// encerra-lo. A segunda nao pode chamar a primeira — abrir <b>grava</b> um
    /// evento de leitura, e encerrar registraria uma visualizacao que ninguem
    /// fez.</para>
    ///
    /// <para><b>As reaberturas vem de todos os chamadores</b>, e nao so de abrir: a
    /// tela troca o relato inteiro pela resposta de encerrar ou de pedir
    /// informacao, e uma lista vazia ali apagaria da tela o motivo de o relato ter
    /// voltado.</para>
    /// </summary>
    private static ReportDetailViewModel Detail(
        Report report,
        ReportClosureViewModel? closure,
        ReportInfoRequestViewModel? infoRequest,
        bool canAskInfo,
        IReadOnlyList<ReportReopeningViewModel> reopenings,
        bool allowsReportArchiving,
        IReadOnlySet<long> team,
        CardFace face) => new(
        report.PublicId,
        report.Kind,
        report.Number,
        report.Title,
        report.ReporterTitle,
        report.Description,
        report.CreatedByUser?.Name,
        report.ArchivedAt,
        // Sempre no card do time; no relato, so com a regra do ciclo ligada.
        report.ArchivedAt is null && (report.Kind == CardKindEnum.Team || allowsReportArchiving),
        // Encerra junto so o relato que ainda nao acabou: o que ja acabou ja levou o
        // motivo a quem relatou.
        report.Kind == CardKindEnum.Report && closure is null,
        report.TrackingCode,
        TypeOf(report),
        report.Text,
        AnswersOf(report),
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
        report.ModerationState,
        // Em ordem de chave, e nao na que o navegador mandou: a mesma informacao
        // trocando de lugar entre dois relatos faz procurar de novo a cada um.
        report.Contexts
            .OrderBy(context => context.Key, StringComparer.Ordinal)
            .Select(context => new ReportContextViewModel(context.Key, context.Value))
            .ToList(),
        reopenings,
        AssigneeOf(report, team),
        PriorityOf(report),
        LabelsOf(report),
        report.DueDate,
        face.Comments,
        face.Attachments,
        face.Closed,
        face.Finished,
        face.Parent is { } pai ? new CardParentViewModel(pai.PublicId, pai.Number, pai.Headline) : null,
        face.Subtasks,
        face.SubtasksDone,
        face.BlockedBy,
        face.DuplicateOf is { } original ? new CardParentViewModel(original.PublicId, original.Number, original.Headline) : null,
        face.DuplicateReporters,
        face.Sprint is { } sprint ? new CardSprintViewModel(sprint.PublicId, sprint.Name, sprint.State) : null,
        report.StoryPoints)
    {
        UpdatedAt = report.UpdatedAt,
        ClosureConfirmed = face.ClosureConfirmed,
        BlockedOrigin = face.BlockedOrigin,
    };

    /// <summary>
    /// As reaberturas como o painel as le, com sessao.
    ///
    /// <para><b>E o primeiro leitor do motivo da reabertura</b> do lado de dentro.
    /// Ate aqui ele era gravado e so aparecia no historico como "quem relatou
    /// reabriu" — o time sabia que voltou, e nao por que.</para>
    /// </summary>
    private async Task<IReadOnlyList<ReportReopeningViewModel>> ReopeningsOfAsync(
        long reportId,
        CancellationToken cancellationToken)
        => (await _unitOfWork.ReportClosures.ListReopenedAsync(reportId, cancellationToken))
            .Select(closure => new ReportReopeningViewModel(
                closure.PublicId,
                closure.Outcome,
                closure.ClosedAt,
                closure.ReopenedAt!.Value,
                closure.ReopenComment))
            .ToList();

    /// <summary>
    /// O projeto da sessao atual. O filtro global ja limita a consulta aos projetos que
    /// a pessoa da sessao enxerga, entao projeto em que ela nao esta simplesmente nao volta —
    /// e a resposta e a mesma de um identificador inventado, de proposito: dizer
    /// "existe, mas nao e seu" confirmaria a existencia dele a um estranho.
    /// </summary>
    private async Task<Project> RequireOwnProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    public async Task<IReadOnlyList<ReportStateCountViewModel>> CountByStateAsync(Guid projectPublicId, ReportFilterDto? filters = null, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var cards = await ResolveCardFilterAsync(project, filters, cancellationToken);
        var counts = await _unitOfWork.Reports.CountByStateAsync(project.Id, cards, cancellationToken);

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

    /// <param name="report">O card.</param>
    /// <param name="team">Quem esta no time agora, para marcar o responsavel que saiu.</param>
    private static ReportSummaryViewModel Map(Report report, IReadOnlySet<long> team, CardFace face) => new(
        report.PublicId,
        report.Kind,
        report.Number,
        report.Title,
        report.ReporterTitle,
        report.TrackingCode,
        TypeOf(report),
        report.Text,
        report.Route,
        report.Origin,
        report.ProjectState?.PublicId,
        report.ProjectState?.Name,
        report.ProjectPublicStage?.Label,
        report.AcceptsQuestions,
        report.PublicStageDueAt,
        report.ArchivedAt,
        report.CreatedAt,
        AssigneeOf(report, team),
        PriorityOf(report),
        LabelsOf(report),
        report.DueDate,
        face.Comments,
        face.Attachments,
        face.Closed,
        face.Finished,
        face.Parent is { } pai ? new CardParentViewModel(pai.PublicId, pai.Number, pai.Headline) : null,
        face.Subtasks,
        face.SubtasksDone,
        face.BlockedBy,
        face.DuplicateOf is { } original ? new CardParentViewModel(original.PublicId, original.Number, original.Headline) : null,
        face.DuplicateReporters,
        face.Sprint is { } sprint ? new CardSprintViewModel(sprint.PublicId, sprint.Name, sprint.State) : null,
        report.StoryPoints)
    {
        UpdatedAt = report.UpdatedAt,
        ClosureConfirmed = face.ClosureConfirmed,
        BlockedOrigin = face.BlockedOrigin,
    };

    /// <summary>
    /// Arquivado se le e se comenta, e so. Mover, editar, encerrar e perguntar pedem
    /// desarquivar antes — arquivar e tirar da tela de Trabalho, e mexer num card
    /// que ninguem ve na tela mudaria o trabalho do time as escondidas.
    /// </summary>
    private static void EnsureNotArchived(Report report, string acao)
    {
        if (report.ArchivedAt is not null)
            throw new ConflictException($"Este card esta arquivado. Desarquive para {acao}.");
    }

    private static bool AllowsReportArchiving(ProjectCycleSettings? regras)
        => regras?.AllowsReportArchiving ?? CycleSettingsDefaults.AllowsReportArchiving;

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
