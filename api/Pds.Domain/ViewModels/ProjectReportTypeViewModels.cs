using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Um tipo de relato do projeto, como a Configuracao o le.
/// </summary>
/// <param name="PublicId">Identificador publico.</param>
/// <param name="Name">O nome que o time deu.</param>
/// <param name="Color">A cor, da paleta fixa.</param>
/// <param name="Icon">O desenho, da lista fixa.</param>
/// <param name="Position">A ordem na tela e na ferramenta.</param>
/// <param name="IsActive">Falso quando foi desativado: continua nos relatos que o tem, e sai da ferramenta.</param>
/// <param name="Questions">As perguntas curtas do formulario, na ordem. Vazia quando o tipo so tem a caixa.</param>
/// <param name="ShowsTextBox">Se a caixa livre aparece.</param>
/// <param name="TextBoxPrompt">O texto dentro da caixa livre; pode vir mesmo com ela escondida, guardado para quando voltar.</param>
/// <param name="InitialStatePublicId">
/// A coluna em que o relato deste tipo entra, ou <b>nulo</b> quando vale o padrao: a
/// primeira coluna ativa da fila.
/// </param>
/// <param name="CreatedAt">Quando foi criado, em UTC.</param>
public record ProjectReportTypeViewModel(
    Guid PublicId,
    string Name,
    CardColorEnum Color,
    ReportTypeIconEnum Icon,
    int Position,
    bool IsActive,
    IReadOnlyList<string> Questions,
    bool ShowsTextBox,
    string? TextBoxPrompt,
    Guid? InitialStatePublicId,
    DateTime CreatedAt);
