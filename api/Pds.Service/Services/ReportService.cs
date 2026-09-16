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
            report.CreatedAt);
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
