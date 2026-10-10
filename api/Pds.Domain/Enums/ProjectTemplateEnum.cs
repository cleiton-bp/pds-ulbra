namespace Pds.Domain.Enums;

/// <summary>
/// O jeito de trabalhar com que o projeto nasce: as colunas do quadro, a jornada
/// publica ligada a elas, os tipos de relato e, no Scrum, as sprints.
///
/// <para><b>So vale na criacao.</b> Depois, cada coisa se muda na propria tela, e o
/// projeto nao lembra de qual modelo veio — aplicar um modelo a um projeto que ja
/// tem relatos teria de decidir o que fazer com cada card, e ninguem pediu isso.
/// A escolha fica gravada so no evento da criacao, para a analise.</para>
///
/// <para>No evento vira texto em snake_case (simple_board, support, kanban, scrum).</para>
/// </summary>
public enum ProjectTemplateEnum
{
    /// <summary>
    /// A fazer, Fazendo, Feito: o quadro de sempre, e o padrao quando nada e
    /// escolhido — quem so digita o nome continua recebendo exatamente isto.
    /// </summary>
    SimpleBoard,

    /// <summary>
    /// Atendimento: o relato chega, alguem cuida, as vezes espera quem relatou
    /// responder, e termina resolvido. Tipos Problema, Duvida e Pedido.
    /// </summary>
    Support,

    /// <summary>Fluxo continuo com fila de entrada e revisao: Backlog, A fazer, Fazendo, Em revisao, Feito.</summary>
    Kanban,

    /// <summary>
    /// O quadro com revisao e as sprints ja ligadas, de duas semanas, com pontos no
    /// card: o time que trabalha em ciclos nao precisa achar a configuracao.
    /// </summary>
    Scrum,
}
