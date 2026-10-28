using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Filters;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ReportRepository : BaseRepository<Report, DataContext>, IReportRepository
{
    /// <summary>
    /// O espaco das travas dos campos do card. Arbitrario; so precisa nao mudar nem
    /// repetir outro — o 7001 e o da cota de anexos, o 7003 o dos nomes das
    /// etiquetas, e o 7004 o da ordem do quadro.
    /// </summary>
    private const int CardFieldsLockSpace = 7002;

    /// <summary>O espaco da trava da ordem do quadro, uma por projeto. Ver o anterior.</summary>
    private const int BoardLockSpace = 7004;

    public ReportRepository(DataContext context) : base(context)
    {
    }

    public Task<bool> TrackingCodeExistsAsync(string trackingCode, CancellationToken cancellationToken = default)
        // Inclui o que foi apagado de proposito: a linha some da lista, mas o papel
        // com o protocolo continua na mao de alguem, e reaproveitar o codigo faria
        // duas pessoas diferentes digitarem o mesmo.
        => Context.Reports
            .IgnoreQueryFilters()
            .AnyAsync(report => report.TrackingCode == trackingCode, cancellationToken);

    public Task<Report?> FindByTrackingCodeWithoutSessionAsync(string trackingCode, CancellationToken cancellationToken = default)
        // Sem `DeletedAt == null`, e de proposito: o link de quem relatou continua
        // valendo depois de o relato sair da lista do painel.
        //
        // **E uma das poucas que dispensam essa condicao**, entre as consultas que
        // atravessam o filtro. As outras reescrevem `DeletedAt == null` a mao, que e
        // o que o filtro dava.
        //
        // Quase todas dispensam pelo mesmo motivo: o que saiu da lista do painel
        // continua valendo para quem tem o papel na mao — o protocolo, o link ou o
        // codigo. Sao a conferencia de protocolo repetido, oito linhas acima; esta;
        // as que a fila usa para reavaliar relato agendado; e a conferencia de
        // colisao do codigo pessoal. As outras duas tem motivo proprio: evento nao se
        // apaga, entao nao ha exclusao logica para repor; e a atividade do envio de
        // anexos conta tambem o arquivo recusado, que tambem e o envio andando.
        //
        // A diferenca desta para a conferencia de protocolo e o que importa: aquela
        // devolve um sim/nao, e esta devolve **conteudo** a quem apresenta um token.
        //
        // O projeto vem junto porque **tres** rotas publicas precisam dele: abrir
        // usa a jornada, e confirmar e reabrir precisam da conta e da versao do
        // mapa para gravar evento. Uma juncao a mais por abertura custa menos do que
        // uma segunda ida ao banco em cada uma delas.
        //
        // E a coluna atual vem junto **porque a reabertura grava de onde o relato
        // saiu**. Sem ela o evento nasce com a origem em branco, e o historico do
        // painel passa a dizer "colocado em Analise" sobre um relato que estava em
        // outra coluna havia semanas — uma linha que descreve um caminho que ninguem
        // percorreu. Nao da erro em lugar nenhum: so mente.
        //
        // E o tipo vem junto porque a pagina diz o nome dele. Sem o filtro aqui, o
        // tipo vem como esta, desativado ou nao — que e o certo: o relato continua
        // sendo do tipo que a pessoa escolheu.
        => Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.Project)
            .Include(report => report.ProjectState)
            .Include(report => report.ReportType)
            .FirstOrDefaultAsync(report => report.TrackingCode == trackingCode, cancellationToken);

    public async Task<IReadOnlyList<Report>> ListByProjectAsync(long projectId, ReportStateFilter filter, bool archived, ReportListOrder order, DateTime? enteredSince, BoardSpot? after, int skip, int take, ReportCardFilter cards, ReportListSort? sort = null, CancellationToken cancellationToken = default)
        // O filtro global ja isola por conta e esconde o que foi apagado; aqui so
        // resta escolher o projeto e o recorte. O Id no fim desempata os relatos do
        // mesmo instante, que sem isso trocariam de lugar entre uma pagina e a
        // seguinte.
        //
        // Cada card vem so com o que a linha dele mostra (ver CardDaLista), e as
        // etiquetas em consulta separada: na mesma consulta, cada card viria repetido
        // uma vez por etiqueta. A ordem e unica (o Id desempata), e e ela que faz as
        // consultas separadas concordarem sobre qual e a pagina.
    {
        var recorte = Filtrar(Context.Reports
            .Where(report => report.ProjectId == projectId)
            .Where(Recorte(filter))
            .Where(Arquivados(archived))
            .Where(EnteredSince(enteredSince))
            .Where(AfterSpot(after)), cards);

        // Na ordem do quadro, o menor lugar fica em cima — e o Id desempata tambem
        // aqui, para a pagina nunca depender da sorte.
        var ordenada = order switch
        {
            ReportListOrder.Board => recorte.OrderBy(report => report.BoardRank).ThenBy(report => report.Id),
            ReportListOrder.Backlog => recorte.OrderBy(report => report.BacklogRank).ThenBy(report => report.Id),
            _ when sort is not null => Ordenar(recorte, sort),
            _ => recorte.OrderByDescending(report => report.CreatedAt).ThenByDescending(report => report.Id),
        };

        return await ordenada
            .Skip(skip)
            .Take(take)
            .Select(CardDaLista)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// O card da lista com o que o resumo dele mostra, e nada alem: os campos da linha e,
    /// do que ele aponta, o nome, a cor e o id publico — e nao as linhas inteiras.
    ///
    /// <para><b>E um card de leitura</b>, montado aqui e nao rastreado: a descricao, as
    /// respostas, o token e os lugares no quadro ficam no banco. Por isso nao serve para
    /// gravar nem para o detalhe, que leem o card inteiro. Campo novo no resumo do card
    /// entra aqui tambem.</para>
    /// </summary>
    private static readonly Expression<Func<Report, Report>> CardDaLista = report => new Report
    {
        Id = report.Id,
        PublicId = report.PublicId,
        AccountId = report.AccountId,
        ProjectId = report.ProjectId,
        Kind = report.Kind,
        Number = report.Number,
        Title = report.Title,
        ReporterTitle = report.ReporterTitle,
        TrackingCode = report.TrackingCode,
        Text = report.Text,
        Route = report.Route,
        Origin = report.Origin,
        AcceptsQuestions = report.AcceptsQuestions,
        PublicStageDueAt = report.PublicStageDueAt,
        ArchivedAt = report.ArchivedAt,
        CreatedAt = report.CreatedAt,
        UpdatedAt = report.UpdatedAt,
        DueDate = report.DueDate,
        StoryPoints = report.StoryPoints,
        AssigneeUserId = report.AssigneeUserId,
        ProjectState = report.ProjectState == null
            ? null
            : new ProjectState { PublicId = report.ProjectState.PublicId, Name = report.ProjectState.Name },
        ProjectPublicStage = report.ProjectPublicStage == null
            ? null
            : new ProjectPublicStage { Label = report.ProjectPublicStage.Label },
        AssigneeUser = report.AssigneeUser == null
            ? null
            : new User
            {
                Id = report.AssigneeUser.Id,
                PublicId = report.AssigneeUser.PublicId,
                Name = report.AssigneeUser.Name,
                Email = report.AssigneeUser.Email,
                AvatarUrl = report.AssigneeUser.AvatarUrl,
            },
        Priority = report.Priority == null
            ? null
            : new ProjectPriority
            {
                PublicId = report.Priority.PublicId,
                Name = report.Priority.Name,
                Color = report.Priority.Color,
                DeactivatedAt = report.Priority.DeactivatedAt,
            },
        ReportType = report.ReportType == null
            ? null
            : new ProjectReportType
            {
                PublicId = report.ReportType.PublicId,
                Name = report.ReportType.Name,
                Color = report.ReportType.Color,
                Icon = report.ReportType.Icon,
                DeactivatedAt = report.ReportType.DeactivatedAt,
            },
        Labels = report.Labels
            .Where(link => link.DeletedAt == null && link.ProjectLabel.DeletedAt == null)
            .Select(link => new ReportLabel
            {
                ProjectLabel = new ProjectLabel
                {
                    PublicId = link.ProjectLabel.PublicId,
                    Name = link.ProjectLabel.Name,
                    Color = link.ProjectLabel.Color,
                },
            })
            .ToList(),
    };

    /// <summary>
    /// A ordem que a pessoa escolheu na lista. <b>O vazio fica no fim nas duas
    /// direcoes</b> — o card sem prazo no topo esconderia os que tem —, o mais novo
    /// desempata, e o Id fecha a ordem total que a pagina por posicao precisa.
    ///
    /// <para>A prioridade vai pela ordem do projeto (a posicao: a de cima e a mais
    /// urgente), e a coluna pela ordem do quadro. Tudo pela mesma consulta, dentro do
    /// filtro de conta e projeto de sempre: as juncoes so leem o que o card ja aponta.</para>
    /// </summary>
    private static IOrderedQueryable<Report> Ordenar(IQueryable<Report> cards, ReportListSort sort)
    {
        var desc = sort.Descending;
        var ordenada = sort.Field switch
        {
            ReportSortField.Number => desc ? cards.OrderByDescending(report => report.Number) : cards.OrderBy(report => report.Number),
            ReportSortField.Created => desc ? cards.OrderByDescending(report => report.CreatedAt) : cards.OrderBy(report => report.CreatedAt),
            ReportSortField.Updated => desc ? cards.OrderByDescending(report => report.UpdatedAt) : cards.OrderBy(report => report.UpdatedAt),
            ReportSortField.Due => Por(cards.OrderBy(report => report.DueDate == null), report => report.DueDate, desc),
            ReportSortField.Priority => Por(cards.OrderBy(report => report.PriorityId == null), report => report.Priority!.Position, desc),
            ReportSortField.State => Por(cards.OrderBy(report => report.ProjectStateId == null), report => report.ProjectState!.Position, desc),
            ReportSortField.Assignee => Por(cards.OrderBy(report => report.AssigneeUserId == null), report => report.AssigneeUser!.Name, desc),
            _ => cards.OrderByDescending(report => report.CreatedAt),
        };

        return ordenada
            .ThenByDescending(report => report.CreatedAt)
            .ThenByDescending(report => report.Id);
    }

    /// <summary>O criterio, na direcao pedida, depois do que ja ordenava (o vazio no fim).</summary>
    private static IOrderedQueryable<Report> Por<TChave>(IOrderedQueryable<Report> antes, Expression<Func<Report, TChave>> chave, bool desc)
        => desc ? antes.ThenByDescending(chave) : antes.ThenBy(chave);

    public Task<int> CountByProjectAsync(long projectId, ReportStateFilter filter, bool archived, DateTime? enteredSince, ReportCardFilter cards, CancellationToken cancellationToken = default)
        => Filtrar(Context.Reports
            .Where(report => report.ProjectId == projectId)
            .Where(Recorte(filter))
            .Where(Arquivados(archived))
            .Where(EnteredSince(enteredSince)), cards)
            .CountAsync(cancellationToken);

    public async Task<IReadOnlyDictionary<long, CardFace>> CountFacesAsync(IReadOnlyCollection<long> reportIds, CancellationToken cancellationToken = default)
    {
        if (reportIds.Count == 0)
            return new Dictionary<long, CardFace>();

        // As regras do "terminou" e da origem bloqueada, como consultas: entram nas de
        // baixo como subconsultas, e nao como copias delas. **Sempre perguntadas pelo Id do
        // card** (Any com o Id): perguntadas soltas, o banco as calculava para o projeto
        // inteiro antes de olhar a pagina.
        var terminados = Context.Reports.Where(Terminado());
        var deOrigemBloqueada = Context.Reports.Where(OrigemBloqueada());

        // **Uma linha por card, numa consulta so**: cada numero da frente e uma
        // subconsulta pelo indice da propria tabela. Eram doze idas ao banco por pagina.
        var linhas = await Context.Reports
            .Where(report => reportIds.Contains(report.Id))
            .Select(report => new
            {
                report.Id,
                // Os dois tipos de comentario, juntos na frente do card: para quem olha o
                // quadro, conversa e conversa — a de dentro e a com quem relatou.
                Comentarios = Context.ReportInternalComments.Count(comment => comment.ReportId == report.Id)
                              + Context.ReportPublicComments.Count(comment => comment.ReportId == report.Id),
                // So o confirmado: o pendente ainda pode nao chegar, e o descartado nunca vale.
                Anexos = Context.ReportAttachments.Count(attachment => attachment.ReportId == report.Id
                                                                       && attachment.Status == AttachmentStatusEnum.Confirmed),
                // O encerramento que vale e o que ninguem reabriu, como na leitura de um so.
                // E, dele, se quem relatou ja confirmou: o confirmado nao reabre ao sair da coluna.
                Encerrado = Context.ReportClosures.Any(closure => closure.ReportId == report.Id && closure.ReopenedAt == null),
                Confirmado = Context.ReportClosures.Any(closure => closure.ReportId == report.Id
                                                                   && closure.ReopenedAt == null
                                                                   && closure.ConfirmedAt != null),
                // Pela mesma regra do filtro de vencidos, e nao por uma copia dela.
                Terminado = terminados.Any(terminado => terminado.Id == report.Id),
                // O pai de quem e subtarefa: o numero e o titulo, para a frente dela.
                Pai = report.ParentReport == null
                    ? null
                    : new
                    {
                        report.ParentReport.PublicId,
                        report.ParentReport.Number,
                        report.ParentReport.Title,
                        report.ParentReport.ReporterTitle,
                        report.ParentReport.Text,
                    },
                // O progresso de quem e pai: as subtarefas fora do arquivo, e as que terminaram
                // — pela mesma regra do "terminou".
                Subtarefas = Context.Reports.Count(sub => sub.ParentReportId == report.Id && sub.ArchivedAt == null),
                Feitas = terminados.Count(sub => sub.ParentReportId == report.Id && sub.ArchivedAt == null),
                // O original de quem e duplicado, como o pai de quem e subtarefa.
                Original = Context.CardLinks
                    .Where(link => link.Type == CardLinkTypeEnum.DuplicateOf && link.FromReportId == report.Id)
                    .Select(link => new
                    {
                        link.ToReport.PublicId,
                        link.ToReport.Number,
                        link.ToReport.Title,
                        link.ToReport.ReporterTitle,
                        link.ToReport.Text,
                    })
                    .FirstOrDefault(),
                // Quantas pessoas a mais leem o desfecho: os relatos duplicados sem encerramento valendo.
                Leitores = Context.CardLinks.Count(link =>
                    link.Type == CardLinkTypeEnum.DuplicateOf
                    && link.ToReportId == report.Id
                    && link.FromReport.Kind == CardKindEnum.Report
                    && !Context.ReportClosures.Any(closure => closure.ReportId == link.FromReportId && closure.ReopenedAt == null)),
                // A sprint de quem tem uma: o nome e o estado, para a frente e para o backlog.
                Sprint = report.Sprint == null ? null : new { report.Sprint.PublicId, report.Sprint.Name, report.Sprint.State },
                // A origem bloqueada, pela mesma regra do filtro: a marca e o filtro nunca
                // discordam sobre o mesmo card.
                OrigemBloqueada = deOrigemBloqueada.Any(bloqueado => bloqueado.Id == report.Id),
            })
            .ToDictionaryAsync(linha => linha.Id, cancellationToken);

        // Quem bloqueia: o que ainda nao terminou e continua no trabalho. O que terminou,
        // ou saiu para o arquivo, deixa de bloquear — pela mesma regra do "terminou". E uma
        // lista por card, e por isso a consulta a parte.
        var bloqueadoPor = (await Context.CardLinks
                .Where(link => link.Type == CardLinkTypeEnum.Blocks
                               && reportIds.Contains(link.ToReportId)
                               && link.FromReport.ArchivedAt == null
                               && !terminados.Any(terminado => terminado.Id == link.FromReportId))
                .Select(link => new { link.ToReportId, link.FromReport.Number })
                .ToListAsync(cancellationToken))
            .GroupBy(row => row.ToReportId)
            .ToDictionary(group => group.Key, group => (IReadOnlyList<int>)group.Select(row => row.Number).Order().ToList());

        return reportIds.Distinct().ToDictionary(
            id => id,
            id => linhas.GetValueOrDefault(id) is not { } linha
                ? CardFace.Empty
                : new CardFace(
                    linha.Comentarios,
                    linha.Anexos,
                    linha.Encerrado,
                    linha.Terminado,
                    linha.Pai is { } pai ? new CardParent(pai.PublicId, pai.Number, Report.HeadlineOf(pai.Title, pai.ReporterTitle, pai.Text)) : null,
                    linha.Subtarefas,
                    linha.Feitas,
                    bloqueadoPor.GetValueOrDefault(id) ?? [],
                    linha.Original is { } original
                        ? new CardParent(original.PublicId, original.Number, Report.HeadlineOf(original.Title, original.ReporterTitle, original.Text))
                        : null,
                    linha.Leitores,
                    linha.Sprint is { } sprint ? new CardSprint(sprint.PublicId, sprint.Name, sprint.State) : null)
                {
                    ClosureConfirmed = linha.Confirmado,
                    BlockedOrigin = linha.OrigemBloqueada,
                });
    }

    public async Task<IReadOnlyList<ReportOriginTally>> TallyOriginsAsync(long projectId, CancellationToken cancellationToken = default)
        // Em minusculo, como a lista compara: o mesmo endereco escrito de dois jeitos
        // seria duas linhas na tela e uma so para o bloqueio. Os arquivados entram — o
        // relato que saiu da tela de Trabalho continua tendo vindo de la.
        => await Context.Reports
            .Where(report => report.ProjectId == projectId
                             && report.Kind == CardKindEnum.Report
                             && report.Origin != null)
            .GroupBy(report => report.Origin!.ToLower())
            .Select(group => new ReportOriginTally(
                group.Key,
                group.Count(),
                group.Count(report => report.BlockedOriginKeptAt == null),
                group.Max(report => report.CreatedAt)))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<HeldOriginTally>> TallyHeldOriginsAsync(long projectId, CancellationToken cancellationToken = default)
        // **Sem o filtro global**, que esconde o retido de toda leitura do painel, e com
        // as condicoes dele reescritas a mao: o projeto, o nao apagado e o retido.
        // Agrupa em minusculo, como a lista compara; o vazio vai com o nulo.
        => (await Context.Reports
                .IgnoreQueryFilters()
                .Where(report => report.ProjectId == projectId
                                 && report.DeletedAt == null
                                 && report.HeldForOriginAt != null)
                .GroupBy(report => report.Origin!.ToLower())
                .Select(group => new { Origin = group.Key, Total = group.Count(), LastAt = group.Max(report => report.CreatedAt) })
                .ToListAsync(cancellationToken))
            .GroupBy(row => string.IsNullOrEmpty(row.Origin) ? null : row.Origin)
            .Select(group => new HeldOriginTally(group.Key, group.Sum(row => row.Total), group.Max(row => row.LastAt)))
            .ToList();

    public Task<List<Report>> ListHeldAsync(long projectId, string? domain, bool includesSubdomains, CancellationToken cancellationToken = default)
    {
        // Sem o filtro global, pelo mesmo motivo da contagem. Rastreados: liberar grava
        // neles, e apagar precisa dos ids.
        var retidos = Context.Reports
            .IgnoreQueryFilters()
            .Where(report => report.ProjectId == projectId
                             && report.DeletedAt == null
                             && report.HeldForOriginAt != null);

        retidos = domain is null
            ? retidos.Where(report => report.Origin == null || report.Origin == "")
            : retidos.Where(report => report.Origin!.ToLower() == domain
                                      || (includesSubdomains && report.Origin!.ToLower().EndsWith("." + domain)));

        return retidos
            .OrderBy(report => report.CreatedAt)
            .ThenBy(report => report.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<bool> AnyHeldFromOriginWithoutSessionAsync(long projectId, string? origin, CancellationToken cancellationToken = default)
        // A entrada do relato nao tem sessao, e o retido nao passa pelo filtro de
        // qualquer jeito: as condicoes vao a mao.
        => string.IsNullOrEmpty(origin)
            ? Context.Reports
                .IgnoreQueryFilters()
                .AnyAsync(report => report.ProjectId == projectId
                                    && report.DeletedAt == null
                                    && report.HeldForOriginAt != null
                                    && (report.Origin == null || report.Origin == ""),
                    cancellationToken)
            : Context.Reports
                .IgnoreQueryFilters()
                .AnyAsync(report => report.ProjectId == projectId
                                    && report.DeletedAt == null
                                    && report.HeldForOriginAt != null
                                    && report.Origin!.ToLower() == origin,
                    cancellationToken);

    public async Task<IReadOnlyDictionary<long, SubtaskMatch>> ListSubtaskMatchesAsync(IReadOnlyCollection<long> parentIds, ReportCardFilter filter, CancellationToken cancellationToken = default)
    {
        var pessoas = filter.AssigneeIds;
        var busca = filter.Search;
        if (parentIds.Count == 0 || filter.ParentId is not null || filter.IncludeSubtasks || (pessoas.Count == 0 && busca is null))
            return new Dictionary<long, SubtaskMatch>();

        // A mesma regra do filtro: a subtarefa que foi sozinha para o arquivo nao conta;
        // no arquivo, as que foram com o pai contam.
        var subtarefas = Context.Reports
            .AsNoTracking()
            .Where(sub => sub.ParentReportId != null
                          && parentIds.Contains(sub.ParentReportId.Value)
                          && (sub.ArchivedAt == null || sub.ParentReport!.ArchivedAt != null));

        var deQuem = pessoas.Count == 0
            ? []
            : await subtarefas
                .Where(sub => sub.AssigneeUserId != null && pessoas.Contains(sub.AssigneeUserId.Value))
                .Select(sub => new
                {
                    Pai = sub.ParentReportId!.Value,
                    Pessoa = sub.AssigneeUserId!.Value,
                    sub.AssigneeUser!.PublicId,
                    Nome = sub.AssigneeUser.Name ?? sub.AssigneeUser.Email ?? string.Empty,
                })
                .ToListAsync(cancellationToken);

        var texto = busca?.Text;
        var achados = texto is null
            ? []
            : (await subtarefas
                    .Where(sub => SqlText.Translate(sub.Title, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto)
                                  || SqlText.Translate(sub.Description, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto))
                    .Select(sub => sub.ParentReportId!.Value)
                    .Distinct()
                    .ToListAsync(cancellationToken))
                .ToHashSet();

        var porPai = deQuem.GroupBy(row => row.Pai).ToDictionary(
            grupo => grupo.Key,
            grupo => (IReadOnlyList<SubtaskAssigneeMatch>)grupo
                .GroupBy(row => row.Pessoa)
                .Select(dela => new SubtaskAssigneeMatch(dela.Key, dela.First().PublicId, dela.First().Nome, dela.Count()))
                .OrderBy(match => match.Name, StringComparer.CurrentCultureIgnoreCase)
                .ToList());

        return porPai.Keys.Union(achados).ToDictionary(
            pai => pai,
            pai => new SubtaskMatch(porPai.GetValueOrDefault(pai) ?? [], achados.Contains(pai)));
    }

    public Task<List<Report>> ListBlockedOriginMarkedAsync(long projectId, IReadOnlyCollection<Guid>? publicIds, long? blockedOriginId, CancellationToken cancellationToken = default)
    {
        // Rastreados: manter grava neles. E so os marcados — o card que nao veio de um
        // endereco bloqueado, ou que o time ja manteve, fica de fora mesmo que tenha
        // sido pedido.
        var cards = Context.Reports
            .Where(report => report.ProjectId == projectId)
            .Where(OrigemBloqueada());

        if (publicIds is not null)
            cards = cards.Where(report => publicIds.Contains(report.PublicId));

        if (blockedOriginId is long bloqueio)
            cards = cards.Where(report => Context.ProjectBlockedOrigins.Any(blocked =>
                blocked.Id == bloqueio
                && (report.Origin!.ToLower() == blocked.Domain
                    || (blocked.IncludesSubdomains && report.Origin!.ToLower().EndsWith("." + blocked.Domain)))));

        return cards.OrderBy(report => report.Id).ToListAsync(cancellationToken);
    }

    public async Task<ReportPurge> PurgeAsync(long projectId, IReadOnlyCollection<long> reportIds, CancellationToken cancellationToken = default)
    {
        // **Sem o filtro global em tudo daqui**, e com o projeto reescrito a mao: a
        // linha apagada logicamente tambem segura a chave estrangeira. A subtarefa que
        // alguem apagou, o vinculo desfeito, o anexo descartado — todos ainda apontam
        // para o card, e o DELETE do card seria recusado por eles.
        var niveis = new List<long[]>();
        var todos = new HashSet<long>();
        var fronteira = reportIds.Where(todos.Add).ToArray();

        // O pai leva as subtarefas, em qualquer profundidade: subtarefa sem pai nao
        // tem onde morar, e o banco nao deixaria o pai sair com ela pendurada.
        while (fronteira.Length > 0)
        {
            niveis.Add(fronteira);
            var pais = fronteira;
            fronteira = (await Context.Reports
                    .IgnoreQueryFilters()
                    .Where(report => report.ProjectId == projectId
                                     && report.ParentReportId != null
                                     && pais.Contains(report.ParentReportId.Value))
                    .Select(report => report.Id)
                    .ToListAsync(cancellationToken))
                .Where(todos.Add)
                .ToArray();
        }

        var ids = todos.ToArray();
        if (ids.Length == 0)
            return new ReportPurge(0, []);

        // Os arquivos saem depois, por quem chamou: o armazenamento nao entra na
        // transacao, e apagar o arquivo antes da linha deixaria um anexo apontando
        // para o nada se o banco falhasse no meio.
        var arquivos = await Context.ReportAttachments
            .IgnoreQueryFilters()
            .Where(attachment => ids.Contains(attachment.ReportId))
            .Select(attachment => new { attachment.ObjectKey, attachment.ThumbnailObjectKey })
            .ToListAsync(cancellationToken);

        // O que segura o card sem cascata no banco: o aviso do sino e o vinculo com outro
        // card. O vinculo sai inteiro, dos dois lados — o outro card perde o vinculo, e
        // nao o proprio card.
        await Context.Notifications
            .IgnoreQueryFilters()
            .Where(notification => notification.ReportId != null && ids.Contains(notification.ReportId.Value))
            .ExecuteDeleteAsync(cancellationToken);

        await Context.CardLinks
            .IgnoreQueryFilters()
            .Where(link => ids.Contains(link.FromReportId) || ids.Contains(link.ToReportId))
            .ExecuteDeleteAsync(cancellationToken);

        // O evento fica — e a contagem da pesquisa —, mas sem o caminho da pagina, que
        // e o unico campo dele que pode carregar algo de alguem (uma rota com o nome
        // da pessoa). O texto nunca foi para o evento. O card sai da linha sozinho: a
        // chave estrangeira do evento zera quando o card e apagado.
        await Context.Database.ExecuteSqlAsync(
            $"UPDATE events SET payload = payload - 'route' WHERE report_id = ANY({ids}) AND payload IS NOT NULL",
            cancellationToken);

        // Das subtarefas mais fundas para o pai: o banco recusa apagar quem ainda tem
        // filho. O resto — contexto, etiquetas, comentarios, encerramentos, pedidos de
        // informacao e anexos — sai junto, pela cascata do banco.
        for (var nivel = niveis.Count - 1; nivel >= 0; nivel--)
        {
            var estes = niveis[nivel];
            await Context.Reports
                .IgnoreQueryFilters()
                .Where(report => report.ProjectId == projectId && estes.Contains(report.Id))
                .ExecuteDeleteAsync(cancellationToken);
        }

        var chaves = arquivos
            .SelectMany(arquivo => new[] { arquivo.ObjectKey, arquivo.ThumbnailObjectKey })
            .OfType<string>()
            .Where(chave => chave.Length > 0)
            .Distinct()
            .ToList();

        return new ReportPurge(ids.Length, chaves);
    }

    /// <summary>
    /// O relato marcado com a origem bloqueada: veio de um endereco que esta na lista
    /// de bloqueados do projeto, e o time ainda nao decidiu mante-lo. **A mesma regra
    /// da porta das rotas publicas** — exato, ou sufixo com o ponto na frente quando a
    /// linha pede os subdominios —, sobre o endereco em minusculo.
    /// </summary>
    private Expression<Func<Report, bool>> OrigemBloqueada()
        => report => report.Kind == CardKindEnum.Report
                     && report.Origin != null
                     && report.BlockedOriginKeptAt == null
                     && Context.ProjectBlockedOrigins.Any(blocked =>
                         blocked.ProjectId == report.ProjectId
                         && (report.Origin.ToLower() == blocked.Domain
                             || (blocked.IncludesSubdomains && report.Origin.ToLower().EndsWith("." + blocked.Domain))));

    public Task<List<Report>> ListSubtasksArchivedAtAsync(long parentId, DateTime? archivedAt, CancellationToken cancellationToken = default)
        // Rastreadas: quem chama muda o arquivo delas. O instante exato e o que separa
        // as que foram com o pai das que ja estavam no arquivo antes.
        //
        // Sem o filtro global, com a exclusao reescrita a mao: o pai tambem volta do
        // arquivo pela pagina de acompanhamento, sem sessao — e quem chega aqui ja
        // provou que pode mexer no pai.
        => Context.Reports
            .IgnoreQueryFilters()
            .Where(report => report.ParentReportId == parentId
                             && report.DeletedAt == null
                             && report.ArchivedAt == archivedAt)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlySet<long>> ListFinishedAsync(IReadOnlyCollection<long> reportIds, CancellationToken cancellationToken = default)
        => reportIds.Count == 0
            ? new HashSet<long>()
            : (await Context.Reports
                    .Where(report => reportIds.Contains(report.Id))
                    .Where(Terminado())
                    .Select(report => report.Id)
                    .ToListAsync(cancellationToken))
                .ToHashSet();

    public Task<long?> FindIdAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default)
        // Pelo filtro global, como as outras leituras: o card de outro projeto, ou apagado,
        // nao existe aqui.
        => Context.Reports
            .Where(report => report.ProjectId == projectId && report.PublicId == publicId)
            .Select(report => (long?)report.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public Task<Report?> FindParentAsync(long projectId, Guid parentPublicId, CancellationToken cancellationToken = default)
        // Pelo filtro global: o card de outro projeto, ou apagado, nao existe aqui.
        => Context.Reports
            .AsNoTracking()
            .FirstOrDefaultAsync(report => report.ProjectId == projectId && report.PublicId == parentPublicId, cancellationToken);

    public async Task LockBoardAsync(long projectId, CancellationToken cancellationToken = default)
    {
        // Como as outras travas consultivas: fora de uma transacao ela nao seguraria
        // nada, e por isso quebra alto.
        if (Context.Database.CurrentTransaction is null)
            throw new InvalidOperationException("A trava da ordem do quadro so vale dentro de uma transacao.");

        var projeto = unchecked((int)projectId);

        await Context.Database.ExecuteSqlAsync(
            $"SELECT pg_advisory_xact_lock({BoardLockSpace}, {projeto})",
            cancellationToken);
    }

    public Task<BoardSpot?> FindBoardSpotAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default)
        // Pelo filtro global, como toda leitura com sessao: o card de outro projeto,
        // ou que ja foi apagado, nao existe aqui.
        => Context.Reports
            .AsNoTracking()
            .Where(report => report.ProjectId == projectId && report.PublicId == publicId)
            .Select(report => new BoardSpot(report.Id, report.ProjectStateId, report.BoardRank, report.ArchivedAt != null))
            .FirstOrDefaultAsync(cancellationToken);

    public Task<long?> FindRankBelowAsync(long projectId, long? stateId, long rank, long anchorId, long exceptId, CancellationToken cancellationToken = default)
        // O arquivado conta: ele guarda o lugar e volta a ele ao desarquivar, entao o
        // numero escolhido nao pode cair em cima do dele.
        => Context.Reports
            .AsNoTracking()
            .Where(report => report.ProjectId == projectId
                             && report.ProjectStateId == stateId
                             && report.Id != exceptId
                             && (report.BoardRank > rank || (report.BoardRank == rank && report.Id > anchorId)))
            .OrderBy(report => report.BoardRank)
            .ThenBy(report => report.Id)
            .Select(report => (long?)report.BoardRank)
            .FirstOrDefaultAsync(cancellationToken);

    public Task RenumberColumnAsync(long projectId, long? stateId, long exceptId, CancellationToken cancellationToken = default)
        // SQL escrito a mao: uma gravacao so para a coluna inteira, na ordem em que
        // ela esta. A marca "ordem do quadro" vai escrita, e nao interpolada, para o
        // log do banco mostra-la. O apagado e o arquivado entram: renumerar so os
        // visiveis poria um arquivado em cima de um deles.
        //
        // A linha que mudou depois da leitura fica como esta. O topo nao trava a ordem,
        // e um card que saiu da coluna, ou foi para o topo dela, no meio desta gravacao
        // voltaria ao lugar velho: o banco espera a outra gravacao, e sem as duas
        // ultimas condicoes escreveria por cima dela.
        => Context.Database.ExecuteSqlAsync($"""
            -- ordem do quadro
            UPDATE reports AS r
            SET board_rank = o.new_rank
            FROM (SELECT id, board_rank AS old_rank,
                         (row_number() OVER (ORDER BY board_rank, id) - 1) * {Report.BoardRankGap} AS new_rank
                  FROM reports
                  WHERE project_id = {projectId}
                    AND project_state_id IS NOT DISTINCT FROM {stateId}::bigint
                    AND id <> {exceptId}) AS o
            WHERE r.id = o.id
              AND r.board_rank = o.old_rank
              AND r.project_state_id IS NOT DISTINCT FROM {stateId}::bigint
            """, cancellationToken);

    public Task<BacklogSpot?> FindBacklogSpotAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default)
        // O card de sprint fechada conta como do backlog: ver NoBacklog.
        => Context.Reports
            .AsNoTracking()
            .Where(report => report.ProjectId == projectId && report.PublicId == publicId)
            .Select(report => new BacklogSpot(
                report.Id,
                report.Sprint != null && report.Sprint.State == SprintStateEnum.Closed ? null : report.SprintId,
                report.BacklogRank,
                report.ArchivedAt != null,
                report.ParentReportId))
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>
    /// O card da lista do backlog: sem sprint, ou numa sprint que ja fechou — o que
    /// terminou nela fica na historia dela, e o que voltou a andar e backlog de novo.
    /// </summary>
    private Expression<Func<Report, bool>> NoBacklog()
        => report => report.SprintId == null
                     || Context.Sprints.Any(sprint => sprint.Id == report.SprintId && sprint.State == SprintStateEnum.Closed);

    /// <summary>A lista de uma sprint, ou a do backlog (<see cref="NoBacklog"/>), sem as subtarefas.</summary>
    private IQueryable<Report> ListaDoBacklog(long projectId, long? sprintId)
    {
        var doProjeto = Context.Reports.AsNoTracking()
            .Where(report => report.ProjectId == projectId && report.ParentReportId == null);
        return sprintId is long id
            ? doProjeto.Where(report => report.SprintId == id)
            : doProjeto.Where(NoBacklog());
    }

    public Task<long?> FindBacklogRankBelowAsync(long projectId, long? sprintId, long rank, long anchorId, long exceptId, CancellationToken cancellationToken = default)
        // A lista e a da sprint (ou do backlog), sem as subtarefas. O arquivado conta,
        // como no quadro: ele guarda o lugar.
        => ListaDoBacklog(projectId, sprintId)
            .Where(report => report.Id != exceptId
                             && (report.BacklogRank > rank || (report.BacklogRank == rank && report.Id > anchorId)))
            .OrderBy(report => report.BacklogRank)
            .ThenBy(report => report.Id)
            .Select(report => (long?)report.BacklogRank)
            .FirstOrDefaultAsync(cancellationToken);

    public Task<long?> FindBacklogEdgeRankAsync(long projectId, long? sprintId, bool top, long exceptId, CancellationToken cancellationToken = default)
    {
        var lista = ListaDoBacklog(projectId, sprintId)
            .Where(report => report.Id != exceptId)
            .Select(report => (long?)report.BacklogRank);

        return top ? lista.MinAsync(cancellationToken) : lista.MaxAsync(cancellationToken);
    }

    public Task RenumberBacklogAsync(long projectId, long? sprintId, long exceptId, CancellationToken cancellationToken = default)
        // O mesmo desenho da ordem do quadro: uma gravacao so, na ordem em que a lista
        // esta, sem escrever por cima de quem mudou depois da leitura.
        => Context.Database.ExecuteSqlAsync($"""
            -- ordem do backlog
            UPDATE reports AS r
            SET backlog_rank = o.new_rank
            FROM (SELECT id, backlog_rank AS old_rank,
                         (row_number() OVER (ORDER BY backlog_rank, id) - 1) * {Report.BoardRankGap} AS new_rank
                  FROM reports
                  WHERE project_id = {projectId}
                    AND (sprint_id IS NOT DISTINCT FROM {sprintId}::bigint
                         OR ({sprintId}::bigint IS NULL AND sprint_id IN (SELECT id FROM sprints WHERE state = 'closed')))
                    AND parent_report_id IS NULL
                    AND id <> {exceptId}) AS o
            WHERE r.id = o.id
              AND r.backlog_rank = o.old_rank
            """, cancellationToken);

    public Task<List<Report>> ListSubtasksAsync(long parentId, CancellationToken cancellationToken = default)
        // Rastreadas: quem chama leva as subtarefas para a sprint do pai.
        => Context.Reports
            .Where(report => report.ParentReportId == parentId)
            .ToListAsync(cancellationToken);

    public Task<List<Report>> ListSprintCardsAsync(long sprintId, CancellationToken cancellationToken = default)
        // Rastreados: fechar a sprint leva os que nao terminaram. Sem as subtarefas (vao
        // com o pai) e sem o arquivo (saiu do trabalho).
        => Context.Reports
            .Where(report => report.SprintId == sprintId && report.ParentReportId == null && report.ArchivedAt == null)
            .OrderBy(report => report.BacklogRank)
            .ThenBy(report => report.Id)
            .ToListAsync(cancellationToken);

    public Task<List<Report>> ListArchivedSprintCardsAsync(long sprintId, CancellationToken cancellationToken = default)
        => Context.Reports
            .Where(report => report.SprintId == sprintId && report.ParentReportId == null && report.ArchivedAt != null)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyDictionary<long, SprintStats>> CountSprintsAsync(IReadOnlyCollection<long> sprintIds, CancellationToken cancellationToken = default)
    {
        if (sprintIds.Count == 0)
            return new Dictionary<long, SprintStats>();

        // Pela mesma regra do "terminou" — e sem as subtarefas, que nao levam pontos.
        var cards = await Context.Reports
            .Where(report => report.SprintId != null
                             && sprintIds.Contains(report.SprintId.Value)
                             && report.ParentReportId == null
                             && report.ArchivedAt == null)
            .Select(report => new { report.Id, Sprint = report.SprintId!.Value, report.StoryPoints })
            .ToListAsync(cancellationToken);

        var ids = cards.Select(card => card.Id).ToList();
        var terminados = await ListFinishedAsync(ids, cancellationToken);

        return cards
            .GroupBy(card => card.Sprint)
            .ToDictionary(
                grupo => grupo.Key,
                grupo => new SprintStats(
                    grupo.Count(),
                    grupo.Count(card => terminados.Contains(card.Id)),
                    grupo.Sum(card => card.StoryPoints ?? 0),
                    grupo.Where(card => terminados.Contains(card.Id)).Sum(card => card.StoryPoints ?? 0)));
    }

    public async Task<IReadOnlyList<ReportStateCount>> CountByStateAsync(long projectId, ReportCardFilter cards, CancellationToken cancellationToken = default)
    {
        // Comeca pelos estados, e nao so por um agrupamento dos relatos: agrupar so
        // devolveria as colunas que tem relato, e a coluna vazia sumiria do filtro
        // no dia em que o ultimo relato dela fosse movido.
        var estados = await Context.ProjectStates
            .Where(state => state.ProjectId == projectId)
            .OrderBy(state => state.Position)
            .ThenBy(state => state.Id)
            .Select(state => new { state.Id, state.PublicId, state.Name, Ativo = state.DeactivatedAt == null })
            .ToListAsync(cancellationToken);

        // Os cards que passam nos filtros, por coluna. O arquivado nao conta: a
        // contagem e a da tela de Trabalho, e ele saiu dela.
        var porEstado = await Filtrar(Context.Reports
                .Where(report => report.ProjectId == projectId && report.ArchivedAt == null), cards)
            .GroupBy(report => report.ProjectStateId)
            .Select(group => new { group.Key, Total = group.Count() })
            .ToDictionaryAsync(row => row.Key ?? 0, row => row.Total, cancellationToken);

        var colunas = estados
            .Select(state => new ReportStateCount(
                state.Id, state.PublicId, state.Name, state.Ativo, porEstado.GetValueOrDefault(state.Id)))
            .ToList();

        // A linha dos que nao tem lugar na fila. Sem ela, a soma das colunas nao
        // bateria com o total e ninguem saberia por que. (Nenhum estado tem o id 0.)
        var semEstado = porEstado.GetValueOrDefault(0);

        return semEstado == 0
            ? colunas
            : [.. colunas, new ReportStateCount(null, null, null, true, semEstado)];
    }

    /// <summary>
    /// Traduz o recorte para a condicao. Os dois nulos do filtro decidem coisas
    /// opostas aqui, e e o unico lugar do sistema onde isso acontece.
    /// </summary>
    private static System.Linq.Expressions.Expression<Func<Report, bool>> Recorte(ReportStateFilter filter)
        => filter switch
        {
            { Restricted: false } => _ => true,
            { StateId: null } => report => report.ProjectStateId == null,
            { StateId: var stateId } => report => report.ProjectStateId == stateId,
        };

    /// <summary>
    /// Os filtros da tela de Trabalho sobre uma consulta de cards. Dentro de um filtro
    /// os valores valem com ou; entre filtros, com e. Filtro nao pedido nao entra na
    /// consulta.
    /// </summary>
    private IQueryable<Report> Filtrar(IQueryable<Report> cards, ReportCardFilter filtro)
    {
        // A subtarefa mora dentro do pai: so a leitura das subtarefas de um card as traz.
        // No banco, e nao na tela, para a pagina, o "Mostrar mais" e a contagem das
        // colunas contarem o mesmo que se ve.
        // A busca de quem vincula pede as subtarefas junto: o vinculo e com elas.
        if (filtro.ParentId is long pai)
            cards = cards.Where(report => report.ParentReportId == pai);
        else if (!filtro.IncludeSubtasks)
            cards = cards.Where(report => report.ParentReportId == null);

        // Com as subtarefas na lista, o pai nao entra mais por elas: ela mesma vem.
        var peloPai = !filtro.IncludeSubtasks;

        if (filtro.Sprint is { } sprint)
        {
            switch (sprint.Kind)
            {
                case SprintScopeKind.Active:
                    cards = cards.Where(report => report.SprintId != null
                                                  && Context.Sprints.Any(item => item.Id == report.SprintId && item.State == SprintStateEnum.Active));
                    break;
                case SprintScopeKind.Backlog:
                    // O que terminou sem sprint fica na lista, e nao no backlog. E o que
                    // esta numa sprint fechada e voltou a andar (o relato reaberto) e
                    // backlog de novo: a fechada nao recebe nem mostra nada.
                    // O pai que terminou com subtarefa aberta tambem fica: a subtarefa vai com
                    // ele, e sem ele ela nao teria lugar nenhum.
                    cards = cards.Where(NoBacklog()).Where(AbertoOuComSubtarefaAberta());
                    break;
                default:
                    var id = sprint.SprintId;
                    cards = cards.Where(report => report.SprintId == id);
                    break;
            }
        }

        if (filtro.AssigneeIds.Count > 0 || filtro.WithoutAssignee)
        {
            // O pai com uma subtarefa da pessoa tambem entra: e onde ela acha a subtarefa
            // que e sua. O "sem responsavel" e so do proprio card — o pai sem ninguem com
            // uma subtarefa sem ninguem nao diz nada a mais.
            var pessoas = filtro.AssigneeIds;
            var semNinguem = filtro.WithoutAssignee;
            var porSubtarefa = pessoas.Count > 0 && peloPai;
            cards = cards.Where(report =>
                (report.AssigneeUserId != null && pessoas.Contains(report.AssigneeUserId.Value))
                || (semNinguem && report.AssigneeUserId == null)
                || (porSubtarefa && Context.Reports.Any(sub =>
                    sub.ParentReportId == report.Id
                    && (sub.ArchivedAt == null || report.ArchivedAt != null)
                    && sub.AssigneeUserId != null
                    && pessoas.Contains(sub.AssigneeUserId.Value))));
        }

        if (filtro.LabelIds.Count > 0)
        {
            var etiquetas = filtro.LabelIds;
            cards = cards.Where(report => report.Labels.Any(link => etiquetas.Contains(link.ProjectLabelId)));
        }

        if (filtro.PriorityIds.Count > 0 || filtro.WithoutPriority)
        {
            var prioridades = filtro.PriorityIds;
            var semPrioridade = filtro.WithoutPriority;
            cards = cards.Where(report =>
                (report.PriorityId != null && prioridades.Contains(report.PriorityId.Value))
                || (semPrioridade && report.PriorityId == null));
        }

        if (filtro.TypeIds.Count > 0 || filtro.TeamCards)
        {
            var tipos = filtro.TypeIds;
            var doTime = filtro.TeamCards;
            cards = cards.Where(report =>
                (report.Kind == CardKindEnum.Report && report.ReportTypeId != null && tipos.Contains(report.ReportTypeId.Value))
                || (doTime && report.Kind == CardKindEnum.Team));
        }

        if (filtro.StateIds is { Count: > 0 } || filtro.WithoutState)
        {
            // As colunas da lista: basta estar numa delas — ou sem coluna, quando pedido.
            var colunas = filtro.StateIds ?? [];
            var semColuna = filtro.WithoutState;
            cards = cards.Where(report =>
                (report.ProjectStateId != null && colunas.Contains(report.ProjectStateId.Value))
                || (semColuna && report.ProjectStateId == null));
        }

        if (filtro.BlockedOrigin)
            cards = cards.Where(OrigemBloqueada());

        if (filtro.OpenOnly)
        {
            // O "Em aberto": o que ainda nao terminou, pela mesma regra do vencido.
            var terminado = Terminado();
            var aberto = Expression.Lambda<Func<Report, bool>>(Expression.Not(terminado.Body), terminado.Parameters);
            cards = cards.Where(aberto);
        }

        if (filtro.OverdueOn is DateOnly dia)
        {
            // Vencido e o que esta atrasado: o prazo passou e o card ainda nao terminou.
            var terminado = Terminado();
            var aberto = Expression.Lambda<Func<Report, bool>>(Expression.Not(terminado.Body), terminado.Parameters);
            cards = cards.Where(report => report.DueDate != null && report.DueDate < dia).Where(aberto);
        }

        if (filtro.Search is { } busca)
        {
            // Sem acento e sem diferenciar maiuscula, pela mesma tabela do termo (ver
            // SearchText). O numero e o protocolo so entram quando o termo pode ser um.
            // O pai tambem entra pelo titulo ou pela descricao de uma subtarefa: ela nao
            // aparece sozinha, e sem isto a busca nunca a acharia.
            var texto = busca.Text;
            var numero = busca.Number;
            var codigo = busca.Code;
            cards = cards.Where(report =>
                (numero != null && report.Number == numero)
                || (codigo != null && report.TrackingCode != null && report.TrackingCode.Replace("-", "").Contains(codigo))
                || SqlText.Translate(report.Title, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto)
                || SqlText.Translate(report.ReporterTitle, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto)
                || SqlText.Translate(report.Text, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto)
                || SqlText.Translate(report.Description, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto)
                || (peloPai && Context.Reports.Any(sub =>
                    sub.ParentReportId == report.Id
                    && (sub.ArchivedAt == null || report.ArchivedAt != null)
                    && (SqlText.Translate(sub.Title, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto)
                        || SqlText.Translate(sub.Description, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto)))));
        }

        return cards;
    }

    /// <summary>
    /// O card que ja terminou: o relato com encerramento valendo, ou o card na ultima
    /// coluna ativa — com duas colunas ou mais, como a regra da ultima coluna do
    /// quadro; com uma so, ela e a entrada da fila, e nada terminou por estar nela. O
    /// desempate da ultima coluna e o de <c>ProjectStates.LastActiveAsync</c>.
    /// </summary>
    /// <summary>
    /// O card que nao terminou — ou que terminou com alguma subtarefa ainda aberta, fora do
    /// arquivo. E o que o backlog mostra.
    /// </summary>
    private Expression<Func<Report, bool>> AbertoOuComSubtarefaAberta()
    {
        var terminado = Terminado();
        var aberto = Expression.Lambda<Func<Report, bool>>(Expression.Not(terminado.Body), terminado.Parameters);
        // A condicao da subtarefa com parametro proprio: o mesmo parametro dentro e fora
        // do lambda o EF nao traduz.
        var sub = Expression.Parameter(typeof(Report), "sub");
        var subAberta = Expression.Lambda<Func<Report, bool>>(
            new TrocaDeParametro(aberto.Parameters[0], sub).Visit(aberto.Body), sub);
        Expression<Func<Report, bool>> comSubtarefaAberta = report => Context.Reports
            .Where(filha => filha.ParentReportId == report.Id && filha.ArchivedAt == null)
            .Where(subAberta)
            .Any();
        var corpo = Expression.OrElse(
            aberto.Body,
            new TrocaDeParametro(comSubtarefaAberta.Parameters[0], aberto.Parameters[0]).Visit(comSubtarefaAberta.Body));
        return Expression.Lambda<Func<Report, bool>>(corpo, aberto.Parameters);
    }

    /// <summary>Troca um parametro por outro numa expressao, para juntar duas condicoes num lambda so.</summary>
    private sealed class TrocaDeParametro(ParameterExpression de, ParameterExpression para) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) => node == de ? para : base.VisitParameter(node);
    }

    private Expression<Func<Report, bool>> Terminado()
    {
        var ultimasColunas = UltimasColunas();
        return report =>
            Context.ReportClosures.Any(closure => closure.ReportId == report.Id && closure.ReopenedAt == null)
            || (report.ProjectStateId != null && ultimasColunas.Contains(report.ProjectStateId.Value));
    }

    /// <summary>
    /// A ultima coluna ativa de cada projeto que tem duas ou mais — a que termina o card.
    ///
    /// <para><b>Uma subconsulta que nao depende do card</b>, de proposito: o banco a
    /// calcula uma vez por consulta. Perguntada card a card, dentro do <c>WHERE</c>, ela
    /// rodava uma vez por linha, e o backlog de 10 mil cards levava segundos.</para>
    /// </summary>
    private IQueryable<long> UltimasColunas()
        => Context.ProjectStates
            .Where(state => state.DeactivatedAt == null
                            // Ninguem depois dela no projeto: nem posicao maior, nem a mesma com Id maior.
                            && !Context.ProjectStates.Any(depois =>
                                depois.ProjectId == state.ProjectId
                                && depois.DeactivatedAt == null
                                && (depois.Position > state.Position
                                    || (depois.Position == state.Position && depois.Id > state.Id)))
                            // E pelo menos outra ativa: com uma coluna so, nada termina por ela.
                            && Context.ProjectStates.Any(outra =>
                                outra.ProjectId == state.ProjectId
                                && outra.DeactivatedAt == null
                                && outra.Id != state.Id))
            .Select(state => state.Id);

    /// <summary>
    /// A tela de Trabalho mostra os que estao nela; o filtro "Arquivados", so os que
    /// sairam. Os dois nunca juntos: misturar faria o arquivado parecer de volta.
    /// </summary>
    private static System.Linq.Expressions.Expression<Func<Report, bool>> Arquivados(bool archived)
        => archived
            ? report => report.ArchivedAt != null
            : report => report.ArchivedAt == null;

    /// <summary>
    /// A regra da ultima coluna do quadro: so o que entrou na coluna a partir de
    /// <paramref name="since"/>. Sem data, todos.
    /// </summary>
    private static System.Linq.Expressions.Expression<Func<Report, bool>> EnteredSince(DateTime? since)
        => since is DateTime desde
            ? report => report.StateChangedAt >= desde
            : _ => true;

    /// <summary>
    /// So o que vem depois de <paramref name="spot"/> na ordem do quadro — o mesmo
    /// criterio da ordem, com o Id desempatando. Sem lugar, todos.
    /// </summary>
    private static System.Linq.Expressions.Expression<Func<Report, bool>> AfterSpot(BoardSpot? spot)
        => spot is BoardSpot ancora
            ? report => report.BoardRank > ancora.Rank || (report.BoardRank == ancora.Rank && report.Id > ancora.Id)
            : _ => true;

    public Task<Report?> GetByPublicIdWithContextsAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default)
        // O estado vem junto porque a tela de detalhe diz em que coluna o relato
        // esta — e e de la que ele vai ser movido.
        //
        // Em consultas separadas: o contexto e as etiquetas sao duas listas, e numa
        // consulta so cada linha de uma se repetiria para cada linha da outra.
        => Context.Reports
            .Include(report => report.Contexts)
            .Include(report => report.ProjectState)
            .Include(report => report.ProjectPublicStage)
            .Include(report => report.CreatedByUser)
            .Include(report => report.AssigneeUser)
            .Include(report => report.Priority)
            .Include(report => report.ReportType)
            .Include(report => report.Labels)
            .ThenInclude(link => link.ProjectLabel)
            .AsSplitQuery()
            .FirstOrDefaultAsync(report => report.ProjectId == projectId && report.PublicId == publicId,
                cancellationToken);

    public async Task LockCardFieldsAsync(long projectId, Guid publicId, CancellationToken cancellationToken = default)
    {
        // Fora de uma transacao, o banco solta a trava no fim deste proprio comando:
        // a chamada "funcionaria" e nao travaria nada. Melhor quebrar alto.
        if (Context.Database.CurrentTransaction is null)
            throw new InvalidOperationException("A trava dos campos do card so vale dentro de uma transacao.");

        // So o numero, e pelo filtro global: o card de outro projeto, ou que nao
        // existe, nao trava nada — quem chamou vai procura-lo em seguida, e e la que
        // a recusa nasce.
        var id = await Context.Reports
            .Where(report => report.ProjectId == projectId && report.PublicId == publicId)
            .Select(report => (long?)report.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (id is not long encontrado)
            return;

        // Consultiva, e nao FOR UPDATE na linha do card: a da linha seguraria tambem
        // quem so quer mover o card ou responder, e esta so espera por outra mudanca
        // de campo do mesmo card. Cards que coincidam no corte para int so esperam um
        // pelo outro, sem erro.
        var card = unchecked((int)encontrado);

        await Context.Database.ExecuteSqlAsync(
            $"SELECT pg_advisory_xact_lock({CardFieldsLockSpace}, {card})",
            cancellationToken);
    }

    public Task<Report?> FindByPublicIdWithoutSessionAsync(Guid publicId, CancellationToken cancellationToken = default)
        // Sem `DeletedAt == null`, como a busca por protocolo: o agendamento de um
        // relato que saiu da lista do painel continua valendo, e descartar aqui
        // deixaria quem o escreveu sem a noticia que ja estava a caminho.
        => Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.Project)
            .Include(report => report.ProjectState)
            .FirstOrDefaultAsync(report => report.PublicId == publicId, cancellationToken);

    public async Task<IReadOnlyList<Report>> ListByReporterCodeWithoutSessionAsync(long reporterCodeId, int limit, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a do acesso. O
        // `Include` da etapa publica existe porque a lista mostra em que passo cada
        // relato esta; o do tipo, porque ela mostra o nome dele.
        //
        // **O `Take` nao e detalhe de desempenho.** A rota e publica e nao pede
        // credencial: sem teto, o custo da resposta cresceria com o uso de quem a
        // pede. Quem chama pede um a mais do que vai mostrar, e e assim que sabe
        // dizer que ha mais sem contar quantos.
        => await Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.ProjectPublicStage)
            .Include(report => report.ReportType)
            .Where(report => report.ReporterCodeId == reporterCodeId
                             && report.DeletedAt == null
                             && report.Project.DeletedAt == null)
            .OrderByDescending(report => report.CreatedAt)
            .ThenByDescending(report => report.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Report>> ListModerationPageAsync(long projectId, ModerationFilter filter, CancellationToken cancellationToken = default)
    {
        var cards = FiltrarModeracao(projectId, filter)
            .Where(report => report.ModerationState == filter.State);

        // A fila vai do mais antigo para o mais novo: lida ao contrario, o primeiro que
        // chegou espera para sempre. O historico vai da decisao mais recente para a mais
        // antiga: e da decisao de agora que alguem se arrepende, e com a ordem da fila
        // ela ficava depois das cinquenta mais antigas, fora do alcance.
        //
        // A data da decisao cai na de chegada so por garantia: decidido sem data nao
        // existe, e sem o "??" uma linha assim sumiria do cursor em vez de aparecer.
        var fila = filter.State == ReportModerationStateEnum.Pending;

        if (filter.After is { } depois)
        {
            var quando = depois.At;
            var id = depois.Id;
            cards = fila
                ? cards.Where(report => report.CreatedAt > quando
                                        || (report.CreatedAt == quando && report.Id > id))
                : cards.Where(report => (report.ModeratedAt ?? report.CreatedAt) < quando
                                        || ((report.ModeratedAt ?? report.CreatedAt) == quando && report.Id < id));
        }

        var ordenados = fila
            ? cards.OrderBy(report => report.CreatedAt).ThenBy(report => report.Id)
            : cards.OrderByDescending(report => report.ModeratedAt ?? report.CreatedAt).ThenByDescending(report => report.Id);

        return await ordenados
            .Include(report => report.ModeratedByUser)
            .Include(report => report.ReportType)
            .Include(report => report.ProjectPublicStage)
            .Take(filter.Limit)
            .ToListAsync(cancellationToken);
    }

    public async Task<ModerationCounts> CountModerationAsync(long projectId, ModerationFilter? filter = null, CancellationToken cancellationToken = default)
    {
        // Uma consulta agrupada, e nao tres contagens: as abas mostram os tres numeros
        // juntos, e tres leituras em momentos diferentes podiam somar um relato duas
        // vezes enquanto alguem decidia.
        var linhas = await FiltrarModeracao(projectId, filter)
            .GroupBy(report => report.ModerationState)
            .Select(grupo => new { Estado = grupo.Key, Total = grupo.Count() })
            .ToListAsync(cancellationToken);

        int De(ReportModerationStateEnum estado) => linhas.FirstOrDefault(linha => linha.Estado == estado)?.Total ?? 0;

        return new ModerationCounts(
            De(ReportModerationStateEnum.Pending),
            De(ReportModerationStateEnum.Approved),
            De(ReportModerationStateEnum.Rejected));
    }

    /// <summary>
    /// Os relatos que a moderacao enxerga, com os filtros da tela. O filtro global ja
    /// isola o acesso e esconde o apagado e o retido pela origem — este ninguem viu
    /// ainda, e a fila nao pode oferecer liberar o que o time nem recebeu.
    ///
    /// <para><b>So relato.</b> O card do time fica "pendente" para sempre — e o que o
    /// banco exige dele —, e sem esta condicao encheria a fila de quem modera com cards
    /// que nunca vao ser liberados.</para>
    /// </summary>
    private IQueryable<Report> FiltrarModeracao(long projectId, ModerationFilter? filter)
    {
        var cards = Context.Reports
            .Where(report => report.ProjectId == projectId && report.Kind == CardKindEnum.Report);

        if (filter is null)
            return cards;

        // A busca e o tipo sao os da tela de Trabalho, pelas mesmas regras. Com as
        // subtarefas: o relato que virou subtarefa de outro card continua precisando de
        // decisao, e na fila ele aparece sozinho.
        if (filter.Search is not null || filter.TypeIds.Count > 0)
            cards = Filtrar(cards, ReportCardFilter.None with
            {
                TypeIds = filter.TypeIds,
                Search = filter.Search,
                IncludeSubtasks = true,
            });

        if (filter.From is DateTime de)
            cards = cards.Where(report => report.CreatedAt >= de);

        if (filter.To is DateTime ate)
            cards = cards.Where(report => report.CreatedAt < ate);

        if (filter.WithoutOrigin)
            cards = cards.Where(report => report.Origin == null || report.Origin == "");
        else if (filter.Origin is { } origem)
            cards = cards.Where(report => report.Origin!.ToLower() == origem);

        return cards;
    }

    public async Task<IReadOnlyList<Report>> ListPublishedWithoutSessionAsync(long projectId, int limit, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a do acesso — e a de
        // estar liberado **dentro da consulta**, para o relato pendente nunca chegar
        // a sair daqui.
        //
        // Ordena por `moderated_at`, e nao por `created_at`: a lista publica conta o
        // que o time acabou de liberar, e relato antigo liberado hoje e novidade
        // para quem esta lendo.
        //
        // O retido tambem fica de fora, escrito aqui: ninguem o liberou, e ele nem
        // apareceu ao time ainda.
        => await Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.ProjectPublicStage)
            .Include(report => report.ReportType)
            .Where(report => report.ProjectId == projectId
                             && report.Kind == CardKindEnum.Report
                             && report.ModerationState == ReportModerationStateEnum.Approved
                             && report.DeletedAt == null
                             && report.HeldForOriginAt == null
                             && report.Project.DeletedAt == null)
            .OrderByDescending(report => report.ModeratedAt)
            .ThenByDescending(report => report.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Guid>> ListOverduePublicStageWithoutSessionAsync(DateTime now, CancellationToken cancellationToken = default)
        // So os identificadores publicos: quem chama vai reabrir cada um no proprio
        // escopo, e carregar as entidades aqui manteria vivo um contexto inteiro
        // durante a reavaliacao de todos eles.
        => await Context.Reports
            .IgnoreQueryFilters()
            .Where(report => report.PublicStageDueAt != null && report.PublicStageDueAt <= now)
            .OrderBy(report => report.PublicStageDueAt)
            .Select(report => report.PublicId)
            .ToListAsync(cancellationToken);
}
