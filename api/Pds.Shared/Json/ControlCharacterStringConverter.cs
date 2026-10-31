using System.Text.Json;
using System.Text.Json.Serialization;
using Pds.Domain.Text;

namespace Pds.Shared.Json;

/// <summary>
/// Todo texto que chega em JSON entra sem caractere de controle (<see cref="ControlCharacters"/>).
///
/// <para><b>Na leitura, e para todo campo.</b> Limpando na fronteira, nenhum campo novo
/// fica de fora por esquecimento. A escrita sai como esta: o que a API devolve ja passou
/// por aqui na entrada.</para>
/// </summary>
public sealed class ControlCharacterStringConverter : JsonConverter<string>
{
    public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => reader.GetString() is { } texto ? ControlCharacters.Strip(texto) : null;

    public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
        => writer.WriteStringValue(value);

    // As chaves de dicionario (o Context do relato publico) passam por aqui, e nao pelo Read.
    public override string ReadAsPropertyName(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => ControlCharacters.Strip(reader.GetString() ?? string.Empty);

    public override void WriteAsPropertyName(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
        => writer.WritePropertyName(value);
}
