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
/// <param name="Parent">O pai, quando o card e subtarefa.</param>
/// <param name="Subtasks">As subtarefas fora do arquivo.</param>
/// <param name="SubtasksDone">Delas, as que terminaram — pela mesma regra de <paramref name="Finished"/>.</param>
/// <param name="BlockedBy">
/// Os numeros dos cards que bloqueiam este e ainda nao terminaram, em ordem. O que
/// terminou, ou foi para o arquivo, deixa de bloquear.
/// </param>
/// <param name="DuplicateOf">O original, quando o card e duplicado.</param>
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
    int DuplicateReporters)
{
    /// <summary>O card sem comentario, sem anexo, sem encerramento, sem pai, sem subtarefa e sem vinculo.</summary>
    public static readonly CardFace Empty = new(0, 0, false, false, null, 0, 0, [], null, 0);
}

/// <summary>Outro card, como a frente deste o mostra: o pai da subtarefa, ou o original do duplicado.</summary>
/// <param name="PublicId">O identificador do card.</param>
/// <param name="Number">O numero do card (#42).</param>
/// <param name="Headline">O titulo do card — o do time, senao o de quem relatou, senao o comeco do texto.</param>
public record CardParent(Guid PublicId, int Number, string Headline);
