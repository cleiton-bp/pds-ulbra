using System.Buffers.Text;
using System.Globalization;
using System.Text;
using Pds.Domain.Enums;

namespace Pds.Service.Reports;

/// <summary>
/// O cursor da fila de moderacao como ele viaja: um texto opaco em base64url, com a aba,
/// o valor da ordem e o identificador publico da ultima linha entregue.
///
/// <para><b>Opaco de proposito.</b> Quem chama devolve o que recebeu, sem montar nada:
/// mudar o que vai dentro (outra ordem, outro desempate) nao quebra nenhuma tela.</para>
///
/// <para><b>O desempate viaja pelo identificador publico, e nunca pelo Id.</b> O Id sai
/// de uma sequencia unica para a tabela inteira, de todas as contas: dentro do cursor,
/// ele virava um contador de quantos cards o sistema todo cria. A API troca o
/// identificador pelo Id ao ler o cursor, e a ordem da consulta continua a mesma.</para>
/// </summary>
public static class ModerationCursorText
{
    private const string InvalidMessage = "Cursor invalido: recomece da primeira pagina.";

    /// <summary>O cursor que continua depois da linha com este valor da ordem e este identificador.</summary>
    public static string Encode(ReportModerationStateEnum state, DateTime at, Guid publicId)
        => Base64Url.EncodeToString(Encoding.UTF8.GetBytes(string.Join('.',
            ((int)state).ToString(CultureInfo.InvariantCulture),
            at.Ticks.ToString(CultureInfo.InvariantCulture),
            publicId.ToString("N", CultureInfo.InvariantCulture))));

    /// <summary>
    /// Le o cursor da aba pedida. Ausente: nulo, a primeira pagina. Fora do formato, ou
    /// de outra aba, e recusado: continuar a fila com o lugar do historico pularia
    /// relatos sem ninguem perceber.
    /// </summary>
    public static ModerationCursorPosition? Decode(string? text, ReportModerationStateEnum state)
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
            || !Guid.TryParseExact(partes[2], "N", out var publicId)
            || ticks > DateTime.MaxValue.Ticks)
            throw new ArgumentException(InvalidMessage);

        if (aba != (int)state)
            throw new ArgumentException("Cursor de outra aba: recomece da primeira pagina.");

        // O valor e o mesmo que saiu do banco, em UTC como toda data do sistema.
        return new ModerationCursorPosition(state, new DateTime(ticks, DateTimeKind.Utc), publicId);
    }
}

/// <summary>
/// O cursor lido, antes de a API achar o Id da ultima linha: a aba, o valor da ordem e o
/// identificador publico.
/// </summary>
/// <param name="State">A aba de onde veio.</param>
/// <param name="At">O valor da ordem da ultima linha entregue.</param>
/// <param name="PublicId">O identificador publico da ultima linha entregue, para o desempate.</param>
public readonly record struct ModerationCursorPosition(ReportModerationStateEnum State, DateTime At, Guid PublicId);
