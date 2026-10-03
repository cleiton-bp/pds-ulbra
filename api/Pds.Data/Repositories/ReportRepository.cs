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

    public async Task<IReadOnlyList<Report>> ListByProjectAsync(long projectId, ReportStateFilter filter, bool archived, ReportListOrder order, DateTime? enteredSince, BoardSpot? after, int skip, int take, CancellationToken cancellationToken = default)
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
        var recorte = Context.Reports
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
            .Where(AfterSpot(after));

        // Na ordem do quadro, o menor lugar fica em cima — e o Id desempata tambem
        // aqui, para a pagina nunca depender da sorte.
        var ordenada = order == ReportListOrder.Board
            ? recorte.OrderBy(report => report.BoardRank).ThenBy(report => report.Id)
            : recorte.OrderByDescending(report => report.CreatedAt).ThenByDescending(report => report.Id);

        return await ordenada
            .Skip(skip)
            .Take(take)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

    public Task<int> CountByProjectAsync(long projectId, ReportStateFilter filter, bool archived, DateTime? enteredSince, CancellationToken cancellationToken = default)
        => Context.Reports
            .Where(report => report.ProjectId == projectId)
            .Where(Recorte(filter))
            .Where(Arquivados(archived))
            .Where(EnteredSince(enteredSince))
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
        var encerrados = (await Context.ReportClosures
                .Where(closure => reportIds.Contains(closure.ReportId) && closure.ReopenedAt == null)
                .Select(closure => closure.ReportId)
                .Distinct()
                .ToListAsync(cancellationToken))
            .ToHashSet();

        return reportIds.Distinct().ToDictionary(
            id => id,
            id => new CardFace(
                internos.GetValueOrDefault(id) + publicos.GetValueOrDefault(id),
                anexos.GetValueOrDefault(id),
                encerrados.Contains(id)));
    }

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

    public async Task<IReadOnlyList<ReportStateCount>> CountByStateAsync(long projectId, CancellationToken cancellationToken = default)
    {
        // Comeca pelos estados, e nao por um agrupamento dos relatos: agrupar so
        // devolveria as colunas que tem relato, e a coluna vazia sumiria do filtro
        // no dia em que o ultimo relato dela fosse movido.
        var porEstado = await Context.ProjectStates
            .Where(state => state.ProjectId == projectId)
            .OrderBy(state => state.Position)
            .ThenBy(state => state.Id)
            .Select(state => new ReportStateCount(
                state.Id,
                state.PublicId,
                state.Name,
                state.DeactivatedAt == null,
                // O arquivado nao conta: a contagem e a da tela de Trabalho, e ele
                // saiu dela.
                Context.Reports.Count(report => report.ProjectStateId == state.Id && report.ArchivedAt == null)))
            .ToListAsync(cancellationToken);

        // A linha dos que nao tem lugar na fila. Sem ela, a soma das colunas nao
        // bateria com o total e ninguem saberia por que.
        var semEstado = await Context.Reports
            .CountAsync(report => report.ProjectId == projectId && report.ProjectStateId == null && report.ArchivedAt == null,
                cancellationToken);

        return semEstado == 0
            ? porEstado
            : [.. porEstado, new ReportStateCount(null, null, null, true, semEstado)];
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
