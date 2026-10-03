using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Como o ciclo fecha neste projeto.
///
/// <para><b>Uma linha por projeto, criada so quando alguem salva.</b> Projeto sem
/// linha e projeto que nunca precisou mudar nada, e responde com os padroes de
/// <see cref="CycleSettingsDefaults"/>. Mesmo desenho da configuracao da
/// ferramenta, e pelo mesmo motivo: criar linha vazia em todo projeto so para
/// guardar o padrao poe o padrao em dois lugares para divergirem depois.</para>
///
/// <para><b>Quase toda regra do ciclo mora aqui, e isso e a regra e nao o acaso.</b>
/// Regra nova de produto nasce como configuracao com padrao que ja funciona;
/// fixar no codigo e a excecao, e precisa de motivo declarado — como o teto de
/// sete etapas, que existe para o produto nao virar outra coisa.</para>
///
/// <para><b>As colunas moram juntas porque descrevem uma coisa so</b> — as regras
/// do ciclo —, e parti-las custaria uma migracao por regra numa tabela que nunca
/// passa de uma linha por projeto.</para>
/// </summary>
public class ProjectCycleSettings : PdsBaseEntity
{
    /// <summary>
    /// Teto da espera, em minutos: uma semana.
    ///
    /// <para>Existe porque a espera segura o que quem relatou ve, e um numero
    /// digitado errado — um zero a mais — deixaria a pessoa sem noticia por meses
    /// sem ninguem perceber que foi engano.</para>
    /// </summary>
    public const int MaxPublicDelayMinutes = 7 * 24 * 60;

    /// <summary>Teto de cada um dos dois prazos do pedido de informacao, em dias.</summary>
    public const int MaxInfoRequestDays = 365;

    /// <summary>Teto dos dias que a ultima coluna do quadro mostra: um ano.</summary>
    public const int MaxLastColumnVisibleDays = 365;

    /// <summary>Teto do "perto do prazo", em dias: um mes. Mais que isso, todo prazo fica perto.</summary>
    public const int MaxDueSoonDays = 30;

    /// <summary>Projeto dono da configuracao. E por ele que o 1:1 acontece.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>Se o relato encerra ao cair na ultima coluna ativa, ou por um botao proprio.</summary>
    public ClosureTriggerEnum ClosureTrigger { get; set; }

    /// <summary>
    /// Quanto o lado publico espera antes de mudar.
    ///
    /// <para>Zero: o lado publico muda na hora. Acima de zero e a janela em que
    /// alguem que moveu o card sem querer ainda desfaz antes de a pessoa la fora
    /// ver.</para>
    /// </summary>
    public int PublicDelayMinutes { get; set; }

    /// <summary>Se quem relatou pode reabrir.</summary>
    public bool AllowsReopen { get; set; }

    /// <summary>
    /// Para qual coluna interna o relato volta ao ser reaberto; nula usa a primeira
    /// ativa.
    /// </summary>
    public long? ReopenStateId { get; set; }
    public ProjectState? ReopenState { get; set; }

    /// <summary>
    /// Se reabrir exige dizer por que. Saber o motivo facilita o trabalho de quem
    /// vai pegar o relato de volta.
    /// </summary>
    public bool ReopenRequiresComment { get; set; }

    /// <summary>
    /// Se quem chega pelo codigo pessoal tambem confirma e reabre, ou se as duas
    /// acoes exigem o link. Ler e inofensivo; reabrir mexe na fila do time.
    /// <b>Fica gravado e e ignorado</b> enquanto confirmar, reabrir e responder so
    /// aceitarem o token do link (ver ActionsAcceptReporterCode no ReportService).
    /// </summary>
    public bool TrackingCodeCanAct { get; set; }

    /// <summary>Se a nota e pedida ao confirmar.</summary>
    public bool SatisfactionEnabled { get; set; }

    /// <summary>Como a escala aparece.</summary>
    public SatisfactionStyleEnum SatisfactionStyle { get; set; }

    /// <summary>
    /// Se confirmar exige responder. Mesmo exigindo, "prefiro nao responder"
    /// continua existindo, fora da escala.
    /// </summary>
    public bool SatisfactionRequired { get; set; }

    /// <summary>
    /// Se o time pode devolver o relato pedindo informacao em vez de encerrar.
    /// </summary>
    public bool InfoRequestEnabled { get; set; }

    /// <summary>Dias sem resposta ate avisar quem relatou.</summary>
    public int InfoRequestWarnDays { get; set; }

    /// <summary>
    /// Dias depois do aviso ate encerrar como "sem retorno". Encerrado assim
    /// continua reabrivel.
    /// </summary>
    public int InfoRequestCloseDays { get; set; }

    /// <summary>
    /// Como a opcao de aceitar duvidas vem marcada no formulario. <b>A escolha
    /// final e de quem relata, e nao do projeto</b> — isto e so o estado inicial da
    /// caixa.
    /// </summary>
    public bool AcceptsQuestionsDefault { get; set; }

    /// <summary>
    /// O time pode arquivar relato — tira-lo da tela de Trabalho.
    ///
    /// <para><b>Desligada de fabrica.</b> O caminho do relato e encerrar com
    /// desfecho. Ligada, arquivar um relato aberto <b>encerra junto</b>, com
    /// desfecho e motivo: quem relatou le o motivo e pode reabrir ou finalizar —
    /// arquivar nunca deixa a pessoa sem retorno.</para>
    /// </summary>
    public bool AllowsReportArchiving { get; set; }

    /// <summary>
    /// Quantos dias a ultima coluna do quadro mostra: o card que entrou nela ha mais
    /// tempo sai do quadro e continua na lista. <b>Zero mostra todos.</b>
    ///
    /// <para><b>Como nos quadros Kanban.</b> A ultima coluna so cresce — e onde o
    /// trabalho termina —, e meses de encerrados nela empurrariam para longe o
    /// trabalho de agora.</para>
    /// </summary>
    public int LastColumnVisibleDays { get; set; }

    /// <summary>
    /// Quando o prazo do card fica perto e o quadro o destaca: faltando ate tantos
    /// dias. <b>Zero destaca so no proprio dia.</b> O vencido e sempre vencido.
    /// </summary>
    public int DueSoonDays { get; set; }
}
