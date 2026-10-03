using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// As prioridades com que todo projeto nasce, da menos para a mais urgente.
///
/// <para><b>Ja funcionam sozinhas</b>, como todo padrao de fabrica: quem nunca abrir
/// a tela de Prioridades prioriza com estas. Os projetos que existiam antes delas as
/// ganharam na migracao, com os mesmos nomes e cores.</para>
/// </summary>
public static class PriorityDefaults
{
    public static readonly IReadOnlyList<(string Name, CardColorEnum Color)> Factory =
    [
        ("Baixa", CardColorEnum.Blue),
        ("Média", CardColorEnum.Yellow),
        ("Alta", CardColorEnum.Orange),
        ("Urgente", CardColorEnum.Red),
    ];
}
