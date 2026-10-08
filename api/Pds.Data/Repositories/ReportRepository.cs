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
        => Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.Project)
            .Include(report => report.ProjectState)
            .FirstOrDefaultAsync(report => report.TrackingCode == trackingCode, cancellationToken);

    public async Task<IReadOnlyList<Report>> ListByProjectAsync(long projectId, ReportStateFilter filter, bool archived, ReportListOrder order, DateTime? enteredSince, BoardSpot? after, int skip, int take, ReportCardFilter cards, ReportListSort? sort = null, CancellationToken cancellationToken = default)
        // O filtro global ja isola por conta e esconde o que foi apagado; aqui so
        // resta escolher o projeto e o recorte. O Id no fim desempata os relatos do
        // mesmo instante, que sem isso trocariam de lugar entre uma pagina e a
        // seguinte.
        //
        // O estado vem por Include porque a lista mostra o nome da coluna: sem ele,
        // a tela teria de buscar os estados a parte e cruzar a mao, e um relato
        // parado numa coluna aposentada ficaria sem nome nenhum.
        //
        // Responsavel, prioridade e etiquetas vem junto pelo mesmo motivo: a linha do
        // card os mostra.
        //
        // Em consultas separadas, como no detalhe: com as etiquetas na mesma consulta,
        // cada card viria repetido uma vez por etiqueta, com o texto e a descricao
        // inteiros a cada repeticao. A ordem e unica (o Id desempata), e e ela que faz
        // as consultas separadas concordarem sobre qual e a pagina.
    {
        var recorte = Filtrar(Context.Reports
            .Include(report => report.ProjectState)
            .Include(report => report.ProjectPublicStage)
            .Include(report => report.AssigneeUser)
            .Include(report => report.Priority)
            .Include(report => report.Labels)
            .ThenInclude(link => link.ProjectLabel)
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
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

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

        // Os dois tipos de comentario, juntos na frente do card: para quem olha o
        // quadro, conversa e conversa — a de dentro e a com quem relatou.
        var internos = await Context.ReportInternalComments
            .Where(comment => reportIds.Contains(comment.ReportId))
            .GroupBy(comment => comment.ReportId)
            .Select(group => new { group.Key, Total = group.Count() })
            .ToDictionaryAsync(row => row.Key, row => row.Total, cancellationToken);

        var publicos = await Context.ReportPublicComments
            .Where(comment => reportIds.Contains(comment.ReportId))
            .GroupBy(comment => comment.ReportId)
            .Select(group => new { group.Key, Total = group.Count() })
            .ToDictionaryAsync(row => row.Key, row => row.Total, cancellationToken);

        // So o confirmado: o pendente ainda pode nao chegar, e o descartado nunca vale.
        var anexos = await Context.ReportAttachments
            .Where(attachment => reportIds.Contains(attachment.ReportId)
                                 && attachment.Status == AttachmentStatusEnum.Confirmed)
            .GroupBy(attachment => attachment.ReportId)
            .Select(group => new { group.Key, Total = group.Count() })
            .ToDictionaryAsync(row => row.Key, row => row.Total, cancellationToken);

        // O encerramento que vale e o que ninguem reabriu, como na leitura de um so.
        // E, dele, se quem relatou ja confirmou: o confirmado nao reabre ao sair da coluna.
        var valendo = await Context.ReportClosures
            .Where(closure => reportIds.Contains(closure.ReportId) && closure.ReopenedAt == null)
            .Select(closure => new { closure.ReportId, Confirmado = closure.ConfirmedAt != null })
            .ToListAsync(cancellationToken);
        var encerrados = valendo.Select(row => row.ReportId).ToHashSet();
        var confirmados = valendo.Where(row => row.Confirmado).Select(row => row.ReportId).ToHashSet();

        // Pela mesma regra do filtro de vencidos, e nao por uma copia dela.
        var terminados = (await Context.Reports
                .Where(report => reportIds.Contains(report.Id))
                .Where(Terminado())
                .Select(report => report.Id)
                .ToListAsync(cancellationToken))
            .ToHashSet();

        // O pai de quem e subtarefa: o numero e o titulo, para a frente dela.
        var pais = (await Context.Reports
                .Where(report => reportIds.Contains(report.Id) && report.ParentReportId != null)
                .Select(report => new
                {
                    report.Id,
                    Pai = report.ParentReport!.PublicId,
                    report.ParentReport.Number,
                    report.ParentReport.Title,
                    report.ParentReport.ReporterTitle,
                    report.ParentReport.Text,
                })
                .ToListAsync(cancellationToken))
            .ToDictionary(
                row => row.Id,
                row => new CardParent(row.Pai, row.Number, Report.HeadlineOf(row.Title, row.ReporterTitle, row.Text)));

        // O progresso de quem e pai: as subtarefas fora do arquivo, e as que terminaram
        // — pela mesma regra do "terminou".
        var subtarefas = await Context.Reports
            .Where(report => report.ParentReportId != null
                             && reportIds.Contains(report.ParentReportId.Value)
                             && report.ArchivedAt == null)
            .GroupBy(report => report.ParentReportId!.Value)
            .Select(group => new { group.Key, Total = group.Count() })
            .ToDictionaryAsync(row => row.Key, row => row.Total, cancellationToken);
        var feitas = subtarefas.Count == 0
            ? new Dictionary<long, int>()
            : await Context.Reports
                .Where(report => report.ParentReportId != null
                                 && reportIds.Contains(report.ParentReportId.Value)
                                 && report.ArchivedAt == null)
                .Where(Terminado())
                .GroupBy(report => report.ParentReportId!.Value)
                .Select(group => new { group.Key, Total = group.Count() })
                .ToDictionaryAsync(row => row.Key, row => row.Total, cancellationToken);

        // Quem bloqueia: o que ainda nao terminou e continua no trabalho. O que terminou,
        // ou saiu para o arquivo, deixa de bloquear — pela mesma regra do "terminou".
        var bloqueios = await Context.CardLinks
            .Where(link => link.Type == CardLinkTypeEnum.Blocks
                           && reportIds.Contains(link.ToReportId)
                           && link.FromReport.ArchivedAt == null)
            .Select(link => new { link.ToReportId, link.FromReportId, link.FromReport.Number })
            .ToListAsync(cancellationToken);
        var bloqueadores = bloqueios.Select(row => row.FromReportId).Distinct().ToList();
        var bloqueadoresTerminados = bloqueadores.Count == 0
            ? []
            : (await Context.Reports
                    .Where(report => bloqueadores.Contains(report.Id))
                    .Where(Terminado())
                    .Select(report => report.Id)
                    .ToListAsync(cancellationToken))
                .ToHashSet();
        var bloqueadoPor = bloqueios
            .Where(row => !bloqueadoresTerminados.Contains(row.FromReportId))
            .GroupBy(row => row.ToReportId)
            .ToDictionary(group => group.Key, group => (IReadOnlyList<int>)group.Select(row => row.Number).Order().ToList());

        // O original de quem e duplicado, como o pai de quem e subtarefa.
        var originais = (await Context.CardLinks
                .Where(link => link.Type == CardLinkTypeEnum.DuplicateOf && reportIds.Contains(link.FromReportId))
                .Select(link => new
                {
                    link.FromReportId,
                    Original = link.ToReport.PublicId,
                    link.ToReport.Number,
                    link.ToReport.Title,
                    link.ToReport.ReporterTitle,
                    link.ToReport.Text,
                })
                .ToListAsync(cancellationToken))
            .ToDictionary(
                row => row.FromReportId,
                row => new CardParent(row.Original, row.Number, Report.HeadlineOf(row.Title, row.ReporterTitle, row.Text)));

        // Quantas pessoas a mais leem o desfecho: os relatos duplicados sem encerramento valendo.
        var leitores = await Context.CardLinks
            .Where(link => link.Type == CardLinkTypeEnum.DuplicateOf
                           && reportIds.Contains(link.ToReportId)
                           && link.FromReport.Kind == CardKindEnum.Report
                           && !Context.ReportClosures.Any(closure => closure.ReportId == link.FromReportId && closure.ReopenedAt == null))
            .GroupBy(link => link.ToReportId)
            .Select(group => new { group.Key, Total = group.Count() })
            .ToDictionaryAsync(row => row.Key, row => row.Total, cancellationToken);

        // A sprint de quem tem uma: o nome e o estado, para a frente e para o backlog.
        var sprints = (await Context.Reports
                .Where(report => reportIds.Contains(report.Id) && report.SprintId != null)
                .Select(report => new { report.Id, report.Sprint!.PublicId, report.Sprint.Name, report.Sprint.State })
                .ToListAsync(cancellationToken))
            .ToDictionary(row => row.Id, row => new CardSprint(row.PublicId, row.Name, row.State));

        return reportIds.Distinct().ToDictionary(
            id => id,
            id => new CardFace(
                internos.GetValueOrDefault(id) + publicos.GetValueOrDefault(id),
                anexos.GetValueOrDefault(id),
                encerrados.Contains(id),
                terminados.Contains(id),
                pais.GetValueOrDefault(id),
                subtarefas.GetValueOrDefault(id),
                feitas.GetValueOrDefault(id),
                bloqueadoPor.GetValueOrDefault(id) ?? [],
                originais.GetValueOrDefault(id),
                leitores.GetValueOrDefault(id),
                sprints.GetValueOrDefault(id))
            {
                ClosureConfirmed = confirmados.Contains(id),
            });
    }

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
        if (filtro.ParentId is long pai)
            cards = cards.Where(report => report.ParentReportId == pai);

        if (filtro.Sprint is { } sprint)
        {
            switch (sprint.Kind)
            {
                case SprintScopeKind.Active:
                    // Com as subtarefas: elas acompanham o pai, e estao no quadro.
                    cards = cards.Where(report => report.SprintId != null
                                                  && Context.Sprints.Any(item => item.Id == report.SprintId && item.State == SprintStateEnum.Active));
                    break;
                case SprintScopeKind.Backlog:
                    // O que terminou sem sprint fica na lista, e nao no backlog. E o que
                    // esta numa sprint fechada e voltou a andar (o relato reaberto) e
                    // backlog de novo: a fechada nao recebe nem mostra nada.
                    // O pai que terminou com subtarefa aberta tambem fica: a subtarefa vai com
                    // ele, e sem ele ela nao teria lugar nenhum.
                    cards = cards.Where(NoBacklog()).Where(report => report.ParentReportId == null).Where(AbertoOuComSubtarefaAberta());
                    break;
                default:
                    var id = sprint.SprintId;
                    cards = cards.Where(report => report.SprintId == id && report.ParentReportId == null);
                    break;
            }
        }

        if (filtro.AssigneeIds.Count > 0 || filtro.WithoutAssignee)
        {
            var pessoas = filtro.AssigneeIds;
            var semNinguem = filtro.WithoutAssignee;
            cards = cards.Where(report =>
                (report.AssigneeUserId != null && pessoas.Contains(report.AssigneeUserId.Value))
                || (semNinguem && report.AssigneeUserId == null));
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

        if (filtro.Types.Count > 0 || filtro.TeamCards)
        {
            var tipos = filtro.Types;
            var doTime = filtro.TeamCards;
            cards = cards.Where(report =>
                (report.Kind == CardKindEnum.Report && report.Type != null && tipos.Contains(report.Type.Value))
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

        if (filtro.WithoutSubtasks)
            cards = cards.Where(report => report.ParentReportId == null);

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
            var texto = busca.Text;
            var numero = busca.Number;
            var codigo = busca.Code;
            cards = cards.Where(report =>
                (numero != null && report.Number == numero)
                || (codigo != null && report.TrackingCode != null && report.TrackingCode.Replace("-", "").Contains(codigo))
                || SqlText.Translate(report.Title, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto)
                || SqlText.Translate(report.ReporterTitle, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto)
                || SqlText.Translate(report.Text, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto)
                || SqlText.Translate(report.Description, SearchText.Accented, SearchText.Plain)!.ToLower().Contains(texto));
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
        => report =>
            Context.ReportClosures.Any(closure => closure.ReportId == report.Id && closure.ReopenedAt == null)
            || (report.ProjectStateId != null
                && Context.ProjectStates.Count(state => state.ProjectId == report.ProjectId && state.DeactivatedAt == null) >= 2
                && report.ProjectStateId == Context.ProjectStates
                    .Where(state => state.ProjectId == report.ProjectId && state.DeactivatedAt == null)
                    .OrderByDescending(state => state.Position)
                    .ThenByDescending(state => state.Id)
                    .Select(state => (long?)state.Id)
                    .FirstOrDefault());

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
        // relato esta.
        //
        // **O `Take` nao e detalhe de desempenho.** A rota e publica e nao pede
        // credencial: sem teto, o custo da resposta cresceria com o uso de quem a
        // pede. Quem chama pede um a mais do que vai mostrar, e e assim que sabe
        // dizer que ha mais sem contar quantos.
        => await Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.ProjectPublicStage)
            .Where(report => report.ReporterCodeId == reporterCodeId
                             && report.DeletedAt == null
                             && report.Project.DeletedAt == null)
            .OrderByDescending(report => report.CreatedAt)
            .ThenByDescending(report => report.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Report>> ListByModerationStateAsync(long projectId, ReportModerationStateEnum state, int limit, CancellationToken cancellationToken = default)
        // O filtro global ja isola o acesso e esconde o apagado. A ordem e a unica
        // do painel que vai do mais antigo para o mais novo: fila lida ao
        // contrario deixa o primeiro que chegou esperando para sempre.
        //
        // **So relato.** O card do time fica "pendente" para sempre — e o que o
        // banco exige dele —, e sem esta condicao encheria a fila de quem modera
        // com cards que nunca vao ser liberados.
        => await Context.Reports
            .Where(report => report.ProjectId == projectId
                             && report.Kind == CardKindEnum.Report
                             && report.ModerationState == state)
            .Include(report => report.ModeratedByUser)
            .OrderBy(report => report.CreatedAt)
            .ThenBy(report => report.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

    public Task<int> CountByModerationStateAsync(long projectId, ReportModerationStateEnum state, CancellationToken cancellationToken = default)
        => Context.Reports
            .CountAsync(report => report.ProjectId == projectId
                                  && report.Kind == CardKindEnum.Report
                                  && report.ModerationState == state,
                cancellationToken);

    public async Task<IReadOnlyList<Report>> ListPublishedWithoutSessionAsync(long projectId, int limit, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a do acesso — e a de
        // estar liberado **dentro da consulta**, para o relato pendente nunca chegar
        // a sair daqui.
        //
        // Ordena por `moderated_at`, e nao por `created_at`: a lista publica conta o
        // que o time acabou de liberar, e relato antigo liberado hoje e novidade
        // para quem esta lendo.
        => await Context.Reports
            .IgnoreQueryFilters()
            .Include(report => report.ProjectPublicStage)
            .Where(report => report.ProjectId == projectId
                             && report.Kind == CardKindEnum.Report
                             && report.ModerationState == ReportModerationStateEnum.Approved
                             && report.DeletedAt == null
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
