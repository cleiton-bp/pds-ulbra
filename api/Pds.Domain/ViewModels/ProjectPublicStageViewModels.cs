using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Uma etapa da jornada publica, como o painel a mostra.
///
/// <para><b>Nao e este o tipo que vai para quem relatou.</b> Este e o da tela de
/// configuracao, e traz coisas que so interessam a quem configura. A resposta da
/// pagina de acompanhamento e montada campo a campo, em separado.</para>
/// </summary>
/// <param name="PublicId">Identificador publico. E o que vai na URL para editar, remover ou reordenar.</param>
/// <param name="Label">O nome do passo, como quem relatou le.</param>
/// <param name="Description">A frase que explica o passo.</param>
/// <param name="NextStep">O que vem depois, ou nulo quando o cliente nao quis dizer.</param>
/// <param name="Position">A ordem da jornada, contada a partir de zero.</param>
/// <param name="IsTerminal">A etapa em que o trabalho do time acaba.</param>
/// <param name="AllowsReturn">A jornada pode voltar para ca.</param>
/// <param name="AwaitsReporter">A etapa espera quem relatou. Ainda nao muda nada.</param>
/// <param name="Outcome">Qual final a etapa representa, ou nulo fora da terminal.</param>
/// <param name="CreatedAt">Quando a etapa foi criada, em UTC.</param>
public record ProjectPublicStageViewModel(
    Guid PublicId,
    string Label,
    string Description,
    string? NextStep,
    int Position,
    bool IsTerminal,
    bool AllowsReturn,
    bool AwaitsReporter,
    PublicOutcomeEnum? Outcome,
    DateTime CreatedAt);
