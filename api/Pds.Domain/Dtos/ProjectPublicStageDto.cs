using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// Uma etapa da jornada publica, ao criar e ao editar.
///
/// <para><b>E um tipo so para os dois verbos, de proposito.</b> Criar e editar
/// mandam exatamente os mesmos campos — nao ha nada que so se escolha uma vez —, e
/// duas classes iguais so criariam a chance de uma ganhar um campo que a outra
/// nao ganhou.</para>
///
/// <para>A posicao nao esta aqui: etapa nova entra no fim, e mudar de lugar e a
/// rota de ordenacao.</para>
/// </summary>
public class SaveProjectPublicStageDto
{
    /// <summary>
    /// O nome do passo, como quem relatou le. Unico dentro do projeto.
    /// </summary>
    /// <example>Em análise</example>
    public string? Label { get; set; }

    /// <summary>
    /// A frase que explica o passo. <b>Obrigatoria</b>: rotulo sozinho e o que a
    /// ferramenta de dentro ja dava.
    /// </summary>
    /// <example>Alguém da equipe está lendo o seu relato para entender o que aconteceu.</example>
    public string? Description { get; set; }

    /// <summary>
    /// O que vem depois, se houver. Nulo ou em branco apaga o texto.
    /// </summary>
    /// <example>Depois de entender, a equipe decide o que fazer.</example>
    public string? NextStep { get; set; }

    /// <summary>
    /// A etapa em que o trabalho do time acaba. Exige <see cref="Outcome"/>.
    ///
    /// <para>Mais de uma etapa pode ser terminal: e assim que a jornada acomoda
    /// finais diferentes de "foi feito".</para>
    /// </summary>
    public bool IsTerminal { get; set; }

    /// <summary>
    /// A jornada pode voltar para esta etapa. Por padrao ela nao anda para tras.
    /// </summary>
    public bool AllowsReturn { get; set; }

    /// <summary>
    /// A etapa espera quem relatou, e nao o time. Ainda nao muda nada em lugar
    /// nenhum — ver a entidade.
    /// </summary>
    public bool AwaitsReporter { get; set; }

    /// <summary>
    /// Done, WontDo, NoAnswer ou Duplicate. <b>Obrigatorio</b> quando
    /// <see cref="IsTerminal"/> e verdadeiro, e recusado quando nao e.
    /// </summary>
    public PublicOutcomeEnum? Outcome { get; set; }
}

/// <summary>
/// A jornada inteira, na ordem nova.
/// </summary>
public class ReorderProjectPublicStagesDto
{
    /// <summary>
    /// Os identificadores publicos das etapas, da primeira a ultima.
    ///
    /// <para>Precisa trazer <b>todas</b> as etapas do projeto, uma vez cada. Uma
    /// lista parcial nao teria como dizer onde fica o que ficou de fora, e a ordem
    /// dele viraria sorteio.</para>
    /// </summary>
    public IReadOnlyList<Guid>? Order { get; set; }
}
