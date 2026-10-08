using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// As regras do ciclo deste projeto.
///
/// <para><b>Nunca vem vazia.</b> Projeto que nunca abriu a tela recebe os padroes,
/// e a resposta e indistinguivel da de quem salvou aqueles mesmos valores — de
/// proposito: quem le nao precisa saber se existe linha no banco, precisa saber
/// como o ciclo se comporta.</para>
///
/// <para><b>A coluna da reabertura sai como identificador publico</b>, e nao como
/// a chave interna: e o mesmo identificador que a tela de estados usa, e e por ele
/// que a escolha volta.</para>
/// </summary>
/// <param name="ClosureTrigger">Se encerra ao cair na ultima coluna ativa, ou por botao.</param>
/// <param name="PublicDelayMinutes">Quanto o lado publico espera. Zero e sem espera.</param>
/// <param name="AllowsReopen">Se quem relatou pode reabrir.</param>
/// <param name="ReopenStatePublicId">Coluna de destino da reabertura; <b>nulo e a primeira ativa</b>.</param>
/// <param name="ReopenRequiresComment">Se reabrir exige dizer por que.</param>
/// <param name="TrackingCodeCanAct">Se quem chega pelo codigo pessoal tambem confirma e reabre. <b>Gravado e ignorado</b> ate essas acoes aceitarem o codigo.</param>
/// <param name="SatisfactionEnabled">Se a nota e pedida ao confirmar.</param>
/// <param name="SatisfactionStyle">Como a escala aparece.</param>
/// <param name="SatisfactionRequired">Se confirmar exige responder.</param>
/// <param name="InfoRequestEnabled">Se o time pode pedir informacao em vez de encerrar.</param>
/// <param name="InfoRequestWarnDays">Dias ate avisar.</param>
/// <param name="InfoRequestCloseDays">Dias depois do aviso ate encerrar.</param>
/// <param name="AcceptsQuestionsDefault">Como a caixa de aceitar duvidas vem marcada.</param>
/// <param name="AllowsReportArchiving">Se o time pode arquivar relato. Arquivar o aberto encerra junto, com desfecho e motivo.</param>
/// <param name="LastColumnVisibleDays">Quantos dias a ultima coluna do quadro mostra. Zero mostra todos.</param>
/// <param name="DueSoonDays">Faltando ate quantos dias o prazo fica em destaque. Zero: so no proprio dia.</param>
/// <param name="SprintsEnabled">Se o time trabalha em sprints: o backlog, o quadro so com a sprint em andamento, e os pontos.</param>
/// <param name="SprintLengthWeeks">A duracao com que cada sprint nasce, em semanas.</param>
public record CycleSettingsViewModel(
    ClosureTriggerEnum ClosureTrigger,
    int PublicDelayMinutes,
    bool AllowsReopen,
    Guid? ReopenStatePublicId,
    bool ReopenRequiresComment,
    bool TrackingCodeCanAct,
    bool SatisfactionEnabled,
    SatisfactionStyleEnum SatisfactionStyle,
    bool SatisfactionRequired,
    bool InfoRequestEnabled,
    int InfoRequestWarnDays,
    int InfoRequestCloseDays,
    bool AcceptsQuestionsDefault,
    bool AllowsReportArchiving,
    int LastColumnVisibleDays,
    int DueSoonDays,
    bool SprintsEnabled,
    int SprintLengthWeeks);
