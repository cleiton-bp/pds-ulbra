namespace Pds.Domain.Enums;

/// <summary>
/// O desenho de um tipo de relato, no botao da ferramenta e no card do painel.
///
/// <para><b>Lista fixa, como a paleta.</b> O nome e a cor do tipo sao do time; o
/// desenho sai desta lista curta porque cada um precisa existir, legivel, nos dois
/// lugares que o mostram — e um desenho livre seria um arquivo enviado por alguem,
/// que a ferramenta teria de buscar no site de cada cliente.</para>
///
/// No banco vira texto em snake_case (bug, improvement, question...).
/// </summary>
public enum ReportTypeIconEnum
{
    /// <summary>O inseto: algo que deveria funcionar e nao funciona.</summary>
    Bug,

    /// <summary>A seta para cima: funciona, mas poderia ser melhor.</summary>
    Improvement,

    /// <summary>O ponto de interrogacao: duvida sobre como usar.</summary>
    Question,

    /// <summary>A lampada: uma sugestao que ainda nao existe.</summary>
    Idea,

    /// <summary>O coracao: o elogio, que tambem e relato.</summary>
    Praise,

    /// <summary>O balao de conversa: o que nao cabe nos outros.</summary>
    Other,
}
