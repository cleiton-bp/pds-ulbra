using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Pds.Shared.Json;

/// <summary>
/// Escreve toda data como ISO-8601 em UTC, com o "Z" no fim.
///
/// As datas sao gravadas em UTC, mas voltam do PostgreSQL sem informacao de fuso
/// (a coluna e <c>timestamp without time zone</c>). Sem o "Z", o navegador leria
/// cada uma como horario local e a linha do tempo apareceria deslocada — tres
/// horas, no nosso caso.
/// </summary>
public sealed class UtcDateTimeJsonConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var raw = reader.GetString();

        if (string.IsNullOrEmpty(raw))
            return default;

        var parsed = DateTime.Parse(
            raw,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);

        return DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };

        writer.WriteStringValue(utc.ToString("O", CultureInfo.InvariantCulture));
    }
}
