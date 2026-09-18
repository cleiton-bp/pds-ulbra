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

    public ReportService(IUnitOfWork unitOfWork, IAccountContext accountContext)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
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

        var report = new Report
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            TrackingCode = await GenerateTrackingCodeAsync(cancellationToken),
            AccessTokenHash = tokenHash,
            Type = dto.Type.Value,
            Text = text,
            Route = SanitizeRoute(dto.Route),
            Origin = Trim(dto.Origin, 260),
            ProjectStateId = landingStateId,
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

        return new CreatedReportViewModel(report.TrackingCode, token, report.CreatedAt);
    }

    public async Task<PublicReportViewModel> OpenTrackingAsync(OpenReportTrackingDto dto, CancellationToken cancellationToken = default)
    {
        var code = (dto.TrackingCode ?? string.Empty).Trim().ToUpperInvariant();
        var token = (dto.Token ?? string.Empty).Trim();

        // Uma recusa so para tudo que da errado aqui: protocolo em branco, token em
        // branco, protocolo que nao existe e token que nao e daquele relato. Quatro
        // mensagens diferentes contariam a quem sonda de qual delas ele esta perto.
        if (code.Length == 0 || token.Length == 0)
            throw new KeyNotFoundException(TrackingRefusal);

        var report = await _unitOfWork.Reports.FindByTrackingCodeWithoutSessionAsync(code, cancellationToken);

        if (report is null)
            throw new KeyNotFoundException(TrackingRefusal);

        // Tempo constante, e e o primeiro caller que esta funcao ganha: um `==`
        // comum para no primeiro caractere diferente, e a diferenca de tempo entre
        // parar no primeiro e parar no decimo permite descobrir o token caractere a
        // caractere — com o protocolo em maos, que e adivinhavel.
        if (!ProjectKeyGenerator.Matches(token, report.AccessTokenHash))
            throw new KeyNotFoundException(TrackingRefusal);

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

        return new PublicReportViewModel(
            report.TrackingCode,
            report.Type,
            report.Text,
            report.CreatedAt,
            await BuildJourneyAsync(report, cancellationToken));
    }

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

        // So entao a traducao: ela e **consequencia** do movimento, e nao parte da
        // decisao de mover. Se ela viesse antes, um projeto sem jornada poderia
        // acabar impedindo o time de trabalhar — e a camada publica existe para
        // servir quem esta de fora, nao para mandar em quem esta dentro.
        var mapaAtual = await _unitOfWork.ProjectStatusMappings
            .ListByVersionAsync(project.Id, project.MappingVersion, cancellationToken);
        var etapasAtuais = await _unitOfWork.ProjectPublicStages
            .ListByProjectAsync(project.Id, cancellationToken);

        await ApplyPublicStageAsync(
            project, report, destino.Id, EventSourceEnum.Panel, _accountContext.UserId,
            mapaAtual, etapasAtuais, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(report);
    }

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
        CancellationToken cancellationToken)
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

        var decisao = StateTranslator.Translate(internalStateId, mapaDoMotor, atual);

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

        await _unitOfWork.CommitAsync(cancellationToken);

        return new ReportDetailViewModel(
            report.PublicId,
            report.TrackingCode,
            report.Type,
            report.Text,
            report.Route,
            report.Origin,
            report.ProjectState?.PublicId,
            report.ProjectState?.Name,
            report.ProjectPublicStage?.Label,
            report.CreatedAt,
            // Em ordem de chave, e nao na que o navegador mandou: a mesma informacao
            // trocando de lugar entre dois relatos faz procurar de novo a cada um.
            report.Contexts
                .OrderBy(context => context.Key, StringComparer.Ordinal)
                .Select(context => new ReportContextViewModel(context.Key, context.Value))
                .ToList());
    }

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

        return counts
            .Select(count => new ReportStateCountViewModel(
                count.StatePublicId,
                count.StateName,
                count.IsActive,
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
