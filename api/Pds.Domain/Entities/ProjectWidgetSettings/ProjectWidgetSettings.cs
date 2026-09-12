using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Como a ferramenta de relato aparece no site de um projeto.
///
/// <para><b>Uma linha por projeto, e ela nasce so quando alguem salva.</b> Os
/// padroes vivem no codigo, nao no banco: um projeto sem linha nao e um projeto
/// quebrado, e sim um que nunca precisou mudar nada. Criar a linha junto com o
/// projeto obrigaria a escolher valores em nome de quem nem abriu a tela, e
/// deixaria os projetos anteriores a esta etapa como excecao a tratar.</para>
///
/// <para><b>Por que coluna, e nao um campo livre.</b> O contexto do relato usa
/// chave e valor porque a lista do que se captura ainda vai crescer; aqui a lista
/// e fechada e acordada — dez campos, cada um com um tipo e um limite. Como
/// coluna, cada um se explica no proprio banco e o tipo errado nao entra.</para>
/// </summary>
public class ProjectWidgetSettings : PdsBaseEntity
{
    /// <summary>
    /// Os tetos dos quatro textos. Moram aqui, e nao no mapeamento, porque quem
    /// grava e quem valida precisam do mesmo numero e so o dominio e visivel para
    /// os dois — como em <see cref="Report.MaxTextLength"/>.
    ///
    /// <para>Sao curtos de proposito. Sao textos que aparecem dentro de um quadro
    /// de 360 pixels: o que nao cabe ali nao e configuracao, e paragrafo.</para>
    /// </summary>
    public const int MaxLauncherLabelLength = 40;

    public const int MaxTitleLength = 60;
    public const int MaxPlaceholderLength = 160;
    public const int MaxSuccessMessageLength = 200;

    /// <summary>O tamanho de <c>#rrggbb</c>. A forma curta e expandida antes de gravar.</summary>
    public const int MaxAccentColorLength = 7;

    /// <summary>Projeto a que esta configuracao pertence. Uma linha por projeto.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// Desliga a ferramenta no site inteiro sem ninguem tocar no script colado.
    ///
    /// <para>E a unica opcao sem substituto: a alternativa seria pedir ao time do
    /// cliente que editasse o HTML do site para tirar uma linha — e devolver
    /// depois.</para>
    /// </summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Cor do gatilho e do botao de enviar, em <c>#rrggbb</c>.
    ///
    /// <para><b>Nulo quer dizer "use o acento do produto"</b>, e e o padrao — e
    /// por isso que gravar esta configuracao substitui a linha inteira em vez de
    /// alterar campo a campo: num corpo parcial, campo ausente e campo nulo
    /// seriam a mesma coisa, e voltar a cor para o padrao viraria impossivel.</para>
    ///
    /// <para>A cor do texto por cima nao se escolhe: ela e derivada da luminancia
    /// desta, senao a primeira pessoa a escolher amarelo perde o rotulo.</para>
    /// </summary>
    public string? AccentColor { get; set; }

    /// <summary>De que canto a ferramenta sai.</summary>
    public WidgetPositionEnum Position { get; set; } = WidgetPositionEnum.BottomRight;

    /// <summary>Claro, escuro, ou o que o sistema de quem visita disser.</summary>
    public WidgetThemeEnum Theme { get; set; } = WidgetThemeEnum.Auto;

    /// <summary>O texto dentro do gatilho, o botao que fica parado na pagina.</summary>
    public string LauncherLabel { get; set; } = string.Empty;

    /// <summary>O titulo dentro do quadro. Nunca o nome do projeto: aquele e nome interno.</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>O texto cinza da caixa vazia. E ele que faz a pergunta certa.</summary>
    public string Placeholder { get; set; } = string.Empty;

    /// <summary>A frase acima do protocolo, na confirmacao.</summary>
    public string SuccessMessage { get; set; } = string.Empty;

    /// <summary>Mostra ou esconde o seletor de tipo.</summary>
    public bool ShowsTypeField { get; set; } = true;

    /// <summary>
    /// Qual opcao vem pre-marcada quando o seletor aparece — e qual tipo e gravado
    /// quando ele esta escondido.
    /// </summary>
    public ReportTypeEnum DefaultReportType { get; set; } = ReportTypeEnum.Bug;
}
