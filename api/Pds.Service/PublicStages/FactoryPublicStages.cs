using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Service.PublicStages;

/// <summary>
/// A jornada com que todo projeto novo nasce.
///
/// <para><b>Existe porque tela em branco nao se preenche.</b> Pedir a quem acabou
/// de criar um projeto que invente do zero cinco passos, com frase explicativa em
/// cada um, e pedir que ele desista — e o padrao nao e regra: tudo aqui pode ser
/// reescrito, removido e reordenado depois.</para>
///
/// <para><b>Os textos tem acento</b>, diferente das mensagens do sistema: nao sao
/// texto nosso, sao o que o usuario final do cliente vai ler na tela, e o cliente
/// reescreve quando quiser — a mesma excecao do nome do estado de fabrica.</para>
///
/// <para><b>"Em validacao" nao esta aqui, e isso foi de proposito.</b> O rotulo e
/// ambiguo: validacao pode ser a equipe testando ou a pessoa conferindo se ficou
/// bom, e quem le precisa saber de quem e a vez. O texto padrao diz "pela equipe"
/// com todas as letras.</para>
/// </summary>
public static class FactoryPublicStages
{
    /// <summary>Uma etapa do conjunto padrao, antes de virar linha no banco.</summary>
    public readonly record struct Definition(
        string Label,
        string Description,
        string? NextStep,
        bool IsTerminal,
        PublicOutcomeEnum? Outcome);

    /// <summary>
    /// As cinco etapas, na ordem.
    ///
    /// <para>So a ultima e terminal, e o unico desfecho que vem pronto e "foi
    /// feito". Os outros tres existem no dominio e ficam a disposicao: quem precisa
    /// mostrar "nao sera feito" como um fim proprio cria a etapa, e ainda cabe
    /// dentro do teto de sete.</para>
    /// </summary>
    public static readonly IReadOnlyList<Definition> All =
    [
        new(
            "Recebido",
            "Seu relato chegou até a equipe e está na fila para ser lido.",
            "Em breve alguém vai analisar o que você enviou.",
            false,
            null),
        new(
            "Em análise",
            "Alguém da equipe está lendo o seu relato para entender o que aconteceu.",
            "Depois de entender, a equipe decide o que vai ser feito.",
            false,
            null),
        new(
            "Em desenvolvimento",
            "A equipe está trabalhando na solução do que você relatou.",
            "Quando a solução ficar pronta, ela ainda passa por teste.",
            false,
            null),
        new(
            "Em teste pela equipe",
            "A equipe está testando a solução antes de publicar.",
            "Se estiver tudo certo, a solução é publicada.",
            false,
            null),
        new(
            "Concluído",
            "A solução foi publicada e o seu relato está encerrado.",
            null,
            true,
            PublicOutcomeEnum.Done),
    ];

    /// <summary>
    /// Monta as linhas do conjunto padrao para um projeto, ja com a posicao.
    /// </summary>
    /// <param name="project">
    /// O projeto dono. Vem pela navegacao, e nao pelo identificador, porque a
    /// jornada de fabrica e gravada no mesmo commit em que o projeto nasce — e ali
    /// ele ainda nao tem chave.
    /// </param>
    public static IEnumerable<ProjectPublicStage> For(Project project)
        => All.Select((definition, position) => new ProjectPublicStage
        {
            Project = project,
            Label = definition.Label,
            Description = definition.Description,
            NextStep = definition.NextStep,
            Position = position,
            IsTerminal = definition.IsTerminal,
            Outcome = definition.Outcome,
        });
}
