using System.Text;

namespace Pds.WebApi.Swagger;

/// <summary>
/// Monta o nome com que cada tipo aparece na seção "Schemas".
///
/// <para>O padrão do Swashbuckle concatena os tipos de fora para dentro, e
/// <c>ApiResponse&lt;IReadOnlyList&lt;ProjectKeyViewModel&gt;&gt;</c> vira
/// <c>ProjectKeyViewModelIReadOnlyListApiResponse</c> — que se lê ao contrário.
/// Aqui sai <c>ApiResponseOfProjectKeyViewModelList</c>, na ordem em que se fala.</para>
/// </summary>
public static class SchemaIdGenerator
{
    /// <summary>Coleções viram o sufixo "List": o tipo exato da coleção não muda o JSON.</summary>
    private static readonly string[] CollectionTypeNames =
        ["IReadOnlyList", "IReadOnlyCollection", "IEnumerable", "ICollection", "List"];

    public static string Build(Type type)
    {
        if (!type.IsGenericType)
            return type.Name;

        var baseName = type.Name[..type.Name.IndexOf('`')];
        var arguments = type.GetGenericArguments();

        if (CollectionTypeNames.Contains(baseName))
            return Build(arguments[0]) + "List";

        var builder = new StringBuilder(baseName).Append("Of");

        for (var index = 0; index < arguments.Length; index++)
        {
            if (index > 0)
                builder.Append("And");

            builder.Append(Build(arguments[index]));
        }

        return builder.ToString();
    }
}
