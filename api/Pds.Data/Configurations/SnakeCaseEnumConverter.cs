using System.Text;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Pds.Data.Configurations;

/// <summary>
/// Grava enum como texto em snake_case, e le de volta.
///
/// Guardar o inteiro seria mais curto, mas deixa a tabela ilegivel em qualquer
/// consulta feita fora da aplicacao — e um <c>status = 1</c> nao diz nada a quem
/// abre o banco para investigar. Como texto, <c>archived</c> se explica sozinho.
/// </summary>
public class SnakeCaseEnumConverter<TEnum> : ValueConverter<TEnum, string>
    where TEnum : struct, Enum
{
    public SnakeCaseEnumConverter()
        : base(value => ToSnakeCase(value.ToString()!),
               value => Parse(value))
    {
    }

    private static TEnum Parse(string value)
        => Enum.Parse<TEnum>(value.Replace("_", string.Empty), ignoreCase: true);

    private static string ToSnakeCase(string name)
    {
        var builder = new StringBuilder(name.Length + 4);

        for (var index = 0; index < name.Length; index++)
        {
            if (char.IsUpper(name[index]) && index > 0)
                builder.Append('_');

            builder.Append(char.ToLowerInvariant(name[index]));
        }

        return builder.ToString();
    }
}
