using System.Text.Json;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Pds.Domain.Entities;

namespace Pds.Data.Configurations;

/// <summary>
/// Grava as respostas do relato como uma lista em JSON (<c>[{"question", "answer"}]</c>),
/// e le de volta.
///
/// <para><b>Por que JSON, e nao uma tabela de respostas.</b> As respostas so existem
/// junto do relato, sao lidas sempre inteiras e na ordem, e nunca sao consultadas uma a
/// uma — a busca e o resto do produto leem o texto montado. Uma tabela pediria juncao
/// em toda abertura de card para guardar o que cabe numa coluna.</para>
///
/// <para>Os nomes vao em snake_case, como as outras chaves em JSON do banco (a carga dos
/// eventos): quem abre a tabela le <c>question</c> e <c>answer</c>.</para>
/// </summary>
public static class ReportAnswersConversion
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public static readonly ValueConverter<List<ReportAnswer>?, string?> Converter = new(
        answers => Write(answers),
        json => Read(json));

    /// <summary>
    /// A comparacao pelo conteudo, e nao pela referencia: sem ela, trocar uma resposta
    /// dentro da mesma lista nao seria visto como mudanca, e a gravacao a deixaria de fora.
    /// </summary>
    public static readonly ValueComparer<List<ReportAnswer>?> Comparer = new(
        (left, right) => left == null ? right == null : right != null && left.SequenceEqual(right),
        answers => answers == null ? 0 : answers.Aggregate(0, (hash, answer) => HashCode.Combine(hash, answer.GetHashCode())),
        answers => answers == null ? null : answers.ToList());

    private static string? Write(List<ReportAnswer>? answers)
        => answers is null ? null : JsonSerializer.Serialize(answers, Options);

    private static List<ReportAnswer>? Read(string? json)
        => string.IsNullOrWhiteSpace(json) ? null : JsonSerializer.Deserialize<List<ReportAnswer>>(json, Options);
}
