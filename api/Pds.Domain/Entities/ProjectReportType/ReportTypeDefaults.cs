using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Os tipos de relato com que todo projeto nasce, na ordem da ferramenta.
///
/// <para><b>Ja funcionam sozinhos</b>, como todo padrao de fabrica: quem nunca abrir
/// a tela de Tipos de relato recebe relatos com estes. Os projetos que existiam antes
/// deles os ganharam na migracao, com os mesmos nomes, perguntas e textos — e cada
/// relato antigo passou a apontar para o seu.</para>
///
/// <para><b>O defeito pergunta, e os outros deixam escrever.</b> Defeito e o relato
/// que o time precisa reproduzir, e as tres perguntas sao as que a reproducao pede.
/// Melhoria e duvida sao texto corrido de quem escreve, e uma caixa com a pergunta
/// certa dentro basta.</para>
/// </summary>
public static class ReportTypeDefaults
{
    public static readonly IReadOnlyList<ReportTypeDefault> Factory =
    [
        new("Defeito", ReportTypeIconEnum.Bug, CardColorEnum.Red,
            [
                "O que você tentou fazer?",
                "O que aconteceu?",
                "O que você esperava que acontecesse?",
            ],
            ShowsTextBox: false, TextBoxPrompt: null),
        new("Melhoria", ReportTypeIconEnum.Improvement, CardColorEnum.Green,
            [],
            ShowsTextBox: true, TextBoxPrompt: "O que você gostaria que mudasse, e por quê?"),
        new("Dúvida", ReportTypeIconEnum.Question, CardColorEnum.Purple,
            [],
            ShowsTextBox: true, TextBoxPrompt: "Qual é a sua dúvida?"),
    ];
}

/// <summary>Um tipo de fabrica, como <see cref="ReportTypeDefaults"/> o descreve.</summary>
/// <param name="Name">O nome.</param>
/// <param name="Icon">O desenho.</param>
/// <param name="Color">A cor.</param>
/// <param name="Questions">As perguntas, na ordem.</param>
/// <param name="ShowsTextBox">Se a caixa livre aparece.</param>
/// <param name="TextBoxPrompt">O texto dentro da caixa, quando ela aparece.</param>
public sealed record ReportTypeDefault(
    string Name,
    ReportTypeIconEnum Icon,
    CardColorEnum Color,
    IReadOnlyList<string> Questions,
    bool ShowsTextBox,
    string? TextBoxPrompt);
