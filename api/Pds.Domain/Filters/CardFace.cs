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
public record CardFace(int Comments, int Attachments, bool Closed, bool Finished, CardParent? Parent, int Subtasks, int SubtasksDone)
{
    /// <summary>O card sem comentario, sem anexo, sem encerramento, sem pai e sem subtarefa.</summary>
    public static readonly CardFace Empty = new(0, 0, false, false, null, 0, 0);
}

/// <summary>O pai de uma subtarefa, como a frente dela o mostra.</summary>
/// <param name="PublicId">O identificador do pai.</param>
/// <param name="Number">O numero do pai (#42).</param>
/// <param name="Headline">O titulo do pai — o do time, senao o de quem relatou, senao o comeco do texto.</param>
public record CardParent(Guid PublicId, int Number, string Headline);
