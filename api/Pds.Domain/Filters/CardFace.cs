namespace Pds.Domain.Filters;

/// <summary>
/// Os numeros da frente do card no quadro, contados em lote para a pagina inteira.
/// </summary>
/// <param name="Comments">Comentarios do card: os internos e os trocados com quem relatou.</param>
/// <param name="Attachments">Anexos confirmados. O pendente ainda pode nao chegar, e o descartado nunca vale.</param>
/// <param name="Closed">Se o relato tem um encerramento valendo — o que ninguem reabriu.</param>
public record CardFace(int Comments, int Attachments, bool Closed)
{
    /// <summary>O card sem comentario, sem anexo e sem encerramento.</summary>
    public static readonly CardFace Empty = new(0, 0, false);
}
