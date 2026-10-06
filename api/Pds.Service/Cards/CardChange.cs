using System.Text.Json;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Service.Cards;

/// <summary>
/// O que um evento de campo do card conta, lido do payload — para a linha do
/// historico.
///
/// <para><b>Le com tolerancia de proposito</b>, como os nomes da mudanca de estado:
/// a tabela so cresce e guarda eventos de versoes antigas, e um payload em outro
/// formato faz a linha aparecer sem o detalhe, em vez de derrubar o historico.</para>
/// </summary>
/// <param name="From">O valor de antes: nome da prioridade, ou prazo (<c>aaaa-mm-dd</c>). No vinculo, o tipo visto deste card.</param>
/// <param name="To">O valor de depois, do mesmo jeito. No vinculo, o numero do outro card.</param>
/// <param name="FromPerson">Quem estava com o card, na mudanca de responsavel.</param>
/// <param name="ToPerson">Quem ficou com o card.</param>
/// <param name="Added">As etiquetas que entraram, com o nome da epoca.</param>
/// <param name="Removed">As etiquetas que sairam.</param>
/// <param name="TitleRestored">Na mudanca de titulo, se o time voltou ao de quem relatou.</param>
public sealed record CardChange(
    string? From,
    string? To,
    Guid? FromPerson,
    Guid? ToPerson,
    IReadOnlyList<string> Added,
    IReadOnlyList<string> Removed,
    bool? TitleRestored)
{
    public static readonly CardChange None = new(null, null, null, null, [], [], null);

    public static CardChange Read(Event entity)
    {
        if (string.IsNullOrWhiteSpace(entity.Payload))
            return None;

        try
        {
            using var documento = JsonDocument.Parse(entity.Payload);
            var raiz = documento.RootElement;

            if (raiz.ValueKind != JsonValueKind.Object)
                return None;

            return entity.Type switch
            {
                EventTypeEnum.CardPriorityChanged => None with { From = Texto(raiz, "from_name"), To = Texto(raiz, "to_name") },
                EventTypeEnum.CardDueDateChanged => None with { From = Texto(raiz, "from"), To = Texto(raiz, "to") },
                EventTypeEnum.CardAssigneeChanged => None with { FromPerson = Pessoa(raiz, "from_id"), ToPerson = Pessoa(raiz, "to_id") },
                EventTypeEnum.CardLabelsChanged => None with { Added = Nomes(raiz, "added"), Removed = Nomes(raiz, "removed") },
                // O tipo visto deste card, e o numero do outro (#42).
                EventTypeEnum.CardLinked or EventTypeEnum.CardUnlinked => None with
                {
                    From = Texto(raiz, "type"),
                    To = raiz.TryGetProperty("other", out var outro) && outro.ValueKind == JsonValueKind.Number && outro.TryGetInt32(out var numero)
                        ? numero.ToString(System.Globalization.CultureInfo.InvariantCulture)
                        : null,
                },
                EventTypeEnum.CardTitleChanged => None with
                {
                    TitleRestored = raiz.TryGetProperty("restored", out var voltou) && voltou.ValueKind == JsonValueKind.True,
                },
                _ => None,
            };
        }
        catch (JsonException)
        {
            return None;
        }
    }

    private static string? Texto(JsonElement raiz, string nome)
        => raiz.TryGetProperty(nome, out var valor) && valor.ValueKind == JsonValueKind.String
            ? valor.GetString()
            : null;

    private static Guid? Pessoa(JsonElement raiz, string nome)
        => Guid.TryParse(Texto(raiz, nome), out var id) ? id : null;

    private static IReadOnlyList<string> Nomes(JsonElement raiz, string nome)
    {
        if (!raiz.TryGetProperty(nome, out var lista) || lista.ValueKind != JsonValueKind.Array)
            return [];

        return lista.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.Object)
            .Select(item => Texto(item, "name"))
            .OfType<string>()
            .ToList();
    }
}
