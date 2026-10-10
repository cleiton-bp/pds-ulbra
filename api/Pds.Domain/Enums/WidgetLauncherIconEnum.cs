namespace Pds.Domain.Enums;

/// <summary>
/// O desenho dentro do botao que fica parado no site do cliente.
///
/// <para><b>Lista fixa, como os desenhos dos tipos de relato.</b> Um desenho livre
/// seria um arquivo enviado pelo cliente, que a ferramenta teria de buscar e conferir
/// em cada visita — e o botao e a parte que carrega em toda pagina. Os desenhos sao
/// tracos simples, no mesmo estilo dos do painel, e cada um diz uma coisa diferente
/// do que o botao faz.</para>
///
/// <para><b>Nenhum e o padrao</b>, e e o botao de hoje: so o texto.</para>
///
/// No banco vira texto em snake_case (none, chat, bug, lightbulb...).
/// </summary>
public enum WidgetLauncherIconEnum
{
    /// <summary>Sem desenho: so o texto. Padrao.</summary>
    None,

    /// <summary>O balao de conversa: "fale com a gente".</summary>
    Chat,

    /// <summary>O inseto: "achou um defeito?".</summary>
    Bug,

    /// <summary>A lampada: "tem uma ideia?".</summary>
    Lightbulb,

    /// <summary>O ponto de interrogacao: "precisa de ajuda?".</summary>
    Question,

    /// <summary>O megafone: "de a sua opiniao".</summary>
    Megaphone,

    /// <summary>A estrela: "avalie".</summary>
    Star,
}
