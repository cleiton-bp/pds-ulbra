using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>Um vinculo do card, visto dele.</summary>
/// <param name="PublicId">O identificador do vinculo — o que se manda para desfazer.</param>
/// <param name="Type">O vinculo visto deste card: duplicado de, duplicado por, bloqueia, bloqueado por, relacionado a.</param>
/// <param name="Card">O outro card.</param>
public record CardLinkViewModel(Guid PublicId, CardLinkRelationEnum Type, CardLinkCardViewModel Card);

/// <summary>O outro card de um vinculo, como a lista de vinculos o mostra.</summary>
/// <param name="PublicId">O identificador do card.</param>
/// <param name="Kind">Relato ou card do time.</param>
/// <param name="Number">O numero do card (#42).</param>
/// <param name="Headline">O titulo: o do time, senao o de quem relatou, senao o comeco do texto.</param>
/// <param name="StatePublicId">A coluna em que o card esta; nula sem coluna.</param>
/// <param name="StateName">O nome da coluna.</param>
/// <param name="Finished">Se o card ja terminou, pela mesma regra do prazo e do bloqueio.</param>
/// <param name="ArchivedAt">Quando foi para o arquivo; nulo fora dele.</param>
public record CardLinkCardViewModel(
    Guid PublicId,
    CardKindEnum Kind,
    int Number,
    string Headline,
    Guid? StatePublicId,
    string? StateName,
    bool Finished,
    DateTime? ArchivedAt);
