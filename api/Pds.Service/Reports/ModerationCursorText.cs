using System.Buffers.Text;
using System.Globalization;
using System.Text;
using Pds.Domain.Enums;
using Pds.Domain.Filters;

namespace Pds.Service.Reports;

/// <summary>
/// O cursor da fila de moderacao como ele viaja: um texto opaco em base64url, com a aba,
/// o valor da ordem e o desempate da ultima linha entregue.
///
/// <para><b>Opaco de proposito.</b> Quem chama devolve o que recebeu, sem montar nada:
/// mudar o que vai dentro — outra ordem, outro desempate — nao quebra nenhuma tela.</para>
/// </summary>
public static class ModerationCursorText
{
    private const string InvalidMessage = "Cursor invalido: recomece da primeira pagina.";

    /// <summary>O cursor que continua depois desta linha.</summary>
    public static string Encode(ModerationCursor cursor)
        => Base64Url.EncodeToString(Encoding.UTF8.GetBytes(string.Join('.',
            ((int)cursor.State).ToString(CultureInfo.InvariantCulture),
            cursor.At.Ticks.ToString(CultureInfo.InvariantCulture),
            cursor.Id.ToString(CultureInfo.InvariantCulture))));

    /// <summary>
    /// Le o cursor da aba pedida. Ausente: nulo, a primeira pagina. Fora do formato, ou
    /// de outra aba, e recusado — continuar a fila com o lugar do historico pularia
    /// relatos sem ninguem perceber.
    /// </summary>
    public static ModerationCursor? Decode(string? text, ReportModerationStateEnum state)
    {
        var valor = text?.Trim();
        if (string.IsNullOrEmpty(valor))
            return null;

        string[] partes;
        try
        {
            partes = Encoding.UTF8.GetString(Base64Url.DecodeFromChars(valor)).Split('.');
        }
        catch (FormatException)
        {
            throw new ArgumentException(InvalidMessage);
        }

        if (partes.Length != 3
            || !int.TryParse(partes[0], NumberStyles.None, CultureInfo.InvariantCulture, out var aba)
            || !long.TryParse(partes[1], NumberStyles.None, CultureInfo.InvariantCulture, out var ticks)
            || !long.TryParse(partes[2], NumberStyles.None, CultureInfo.InvariantCulture, out var id)
            || ticks > DateTime.MaxValue.Ticks)
            throw new ArgumentException(InvalidMessage);

        if (aba != (int)state)
            throw new ArgumentException("Cursor de outra aba: recomece da primeira pagina.");

        // O valor e o mesmo que saiu do banco, em UTC como toda data do sistema.
        return new ModerationCursor(state, new DateTime(ticks, DateTimeKind.Utc), id);
    }
}
