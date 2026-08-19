using System.Text.Json;
using System.Text.Json.Serialization;

namespace Pds.Shared.Json;

/// <summary>
/// Contrato de serializacao da API.
///
/// <para><b>PascalCase, e nao camelCase.</b> E o oposto do banco de proposito: o
/// banco fala <c>snake_case</c> para dentro e a API fala <c>PascalCase</c> para
/// fora. A fronteira fica visivel a olho nu — quem le <c>account_id</c> sabe que
/// esta olhando banco, quem le <c>AccountId</c> sabe que esta olhando contrato.</para>
///
/// <para>Os valores de enum acompanham as propriedades e saem em PascalCase
/// (<c>Active</c>, <c>Public</c>). Misturar as duas convencoes no mesmo JSON e o
/// que confunde; escolher uma resolve.</para>
///
/// <para>Centralizado aqui para que a API e os testes usem exatamente a mesma
/// configuracao — um teste que serializa diferente da producao nao testa nada.</para>
/// </summary>
public static class PdsJsonOptions
{
    public static void Apply(JsonSerializerOptions options)
    {
        // Nulo significa "use o nome da propriedade como esta", que ja e PascalCase.
        options.PropertyNamingPolicy = null;
        options.DictionaryKeyPolicy = null;

        // Enum como texto: um "1" no JSON nao diz nada a quem le a resposta.
        options.Converters.Add(new JsonStringEnumConverter(namingPolicy: null));
        options.Converters.Add(new UtcDateTimeJsonConverter());
    }

    /// <summary>Opcoes prontas, para uso fora do pipeline do ASP.NET.</summary>
    public static JsonSerializerOptions Create()
    {
        var options = new JsonSerializerOptions();
        Apply(options);
        return options;
    }
}
