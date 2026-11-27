namespace Pds.Domain.Enums;

/// <summary>
/// Por que uma coluna nao pode ser excluida agora. O painel transforma o codigo em frase:
/// a coluna diz o motivo na propria tela, e a pessoa sabe o que fazer.
///
/// <para><b>Excluir e para a coluna que nao deixou rastro</b>: a que nunca recebeu card,
/// ou a que e so do time (sem etapa publica) e ja foi desativada. O historico dos cards
/// guarda o nome da coluna em cada movimento, e por isso continua legivel.</para>
/// </summary>
public enum ProjectStateDeleteBlockEnum
{
    /// <summary>Ainda segura algum card (vivo, arquivado ou apagado).</summary>
    Cards,

    /// <summary>E a coluna de entrada de algum tipo de relato, inclusive dos desativados.</summary>
    TypeEntry,

    /// <summary>E para onde vai o relato reaberto, no Encerramento.</summary>
    ReopenTarget,

    /// <summary>E a unica coluna ativa: o quadro precisa de ao menos uma.</summary>
    OnlyActiveColumn,

    /// <summary>Ja teve cards e esta ligada a uma etapa que quem relatou ve: so desativar.</summary>
    PublicStage,

    /// <summary>Ja teve cards e ainda esta ativa: desativar primeiro, e depois excluir.</summary>
    StillActive,
}
