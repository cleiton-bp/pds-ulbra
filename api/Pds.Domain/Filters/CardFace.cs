namespace Pds.Domain.Filters;

/// <summary>
/// Os numeros da frente do card no quadro, contados em lote para a pagina inteira.
/// </summary>
/// <param name="Comments">Comentarios do card: os internos e os trocados com quem relatou.</param>
/// <param name="Attachments">Anexos confirmados. O pendente ainda pode nao chegar, e o descartado nunca vale.</param>
/// <param name="Closed">Se o relato tem um encerramento valendo — o que ninguem reabriu.</param>
/// <param name="Finished">
/// Se o card ja terminou: encerramento valendo, ou a ultima coluna ativa (com duas ou
/// mais). A mesma regra do filtro de vencidos, contada no mesmo lugar.
/// </param>
/// <param name="Parent">O pai, quando o card e subtarefa — a subtarefa aberta o mostra.</param>
/// <param name="Subtasks">As subtarefas fora do arquivo.</param>
/// <param name="SubtasksDone">Delas, as que terminaram — pela mesma regra de <paramref name="Finished"/>.</param>
/// <param name="BlockedBy">
/// Os numeros dos cards que bloqueiam este e ainda nao terminaram, em ordem. O que
/// terminou, ou foi para o arquivo, deixa de bloquear.
/// </param>
/// <param name="DuplicateOf">O original, quando o card e duplicado.</param>
/// <param name="Sprint">A sprint do card; nula no backlog.</param>
/// <param name="DuplicateReporters">
/// Quantos relatos duplicados deste card ainda esperam o desfecho — as pessoas a mais
/// que leem o motivo quando ele encerra.
/// </param>
public record CardFace(
    int Comments,
    int Attachments,
    bool Closed,
    bool Finished,
    CardParent? Parent,
    int Subtasks,
    int SubtasksDone,
    IReadOnlyList<int> BlockedBy,
    CardParent? DuplicateOf,
    int DuplicateReporters,
    CardSprint? Sprint = null)
{
    /// <summary>Se quem relatou ja confirmou o encerramento que vale; falso sem encerramento.</summary>
    public bool ClosureConfirmed { get; init; }

    /// <summary>
    /// O relato veio de um endereco que o projeto bloqueou, e o time ainda nao decidiu
    /// mante-lo. Sai da lista de bloqueados de agora: desbloquear desmarca.
    /// </summary>
    public bool BlockedOrigin { get; init; }

    /// <summary>O card sem comentario, sem anexo, sem encerramento, sem pai, sem subtarefa, sem vinculo e sem sprint.</summary>
    public static readonly CardFace Empty = new(0, 0, false, false, null, 0, 0, [], null, 0);
}

/// <summary>A sprint do card, como a frente dele a mostra.</summary>
public record CardSprint(Guid PublicId, string Name, Pds.Domain.Enums.SprintStateEnum State);

/// <summary>Outro card, como a frente deste o mostra: o pai da subtarefa, ou o original do duplicado.</summary>
/// <param name="PublicId">O identificador do card.</param>
/// <param name="Number">O numero do card (#42).</param>
/// <param name="Headline">O titulo do card — o do time, senao o de quem relatou, senao o comeco do texto.</param>
public record CardParent(Guid PublicId, int Number, string Headline);

/// <summary>
/// Por que o pai entrou no filtro pelas subtarefas: a frente dele diz "1 subtarefa sua"
/// ou "na subtarefa". A subtarefa mora dentro do pai, e e assim que quem a procura chega
/// ate ela.
/// </summary>
/// <param name="Assignees">
/// Quantas subtarefas de cada pessoa do filtro de responsavel. Vazia sem esse filtro, ou
/// quando nenhuma subtarefa e de quem foi escolhido.
/// </param>
/// <param name="Search">Se a busca achou o termo no titulo ou na descricao de uma subtarefa.</param>
public record SubtaskMatch(IReadOnlyList<SubtaskAssigneeMatch> Assignees, bool Search);

/// <summary>As subtarefas de uma pessoa do filtro de responsavel, dentro de um pai.</summary>
/// <param name="UserId">A pessoa.</param>
/// <param name="UserPublicId">O identificador publico dela.</param>
/// <param name="Name">O nome, ou o e-mail de quem nao tem nome.</param>
/// <param name="Count">Quantas subtarefas do pai sao dela.</param>
public record SubtaskAssigneeMatch(long UserId, Guid UserPublicId, string Name, int Count);
