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
/// <para><b>Quase tudo da etapa mora aqui, e isso e a regra e nao o acaso.</b>
/// Regra nova de produto nasce como configuracao com padrao que ja funciona;
/// fixar no codigo e a excecao, e precisa de motivo declarado — como o teto de
/// sete etapas, que existe para o produto nao virar outra coisa.</para>
///
/// <para><b>A maioria das colunas ainda nao tem leitor.</b> Elas chegam nos passos
/// seguintes desta etapa, e nascem juntas porque descrevem uma coisa so — as
/// regras do ciclo — e parti-las custaria uma migracao por passo numa tabela que
/// nunca passa de uma linha por projeto.</para>
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

    /// <summary>Projeto dono da configuracao. E por ele que o 1:1 acontece.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>Se o relato encerra ao cair na ultima coluna ativa, ou por um botao proprio.</summary>
    public ClosureTriggerEnum ClosureTrigger { get; set; }

    /// <summary>
    /// Quanto o lado publico espera antes de mudar.
    ///
    /// <para>Zero e o comportamento anterior a esta etapa. Acima de zero e a janela
    /// em que alguem que moveu o card sem querer ainda desfaz antes de a pessoa la
    /// fora ver. <b>Ainda nao tem leitor.</b></para>
    /// </summary>
    public int PublicDelayMinutes { get; set; }

    /// <summary>Se quem relatou pode reabrir. <b>Ainda nao tem leitor.</b></summary>
    public bool AllowsReopen { get; set; }

    /// <summary>
    /// Para qual coluna interna o relato volta ao ser reaberto; nula usa a primeira
    /// ativa. <b>Ainda nao tem leitor.</b>
    /// </summary>
    public long? ReopenStateId { get; set; }
    public ProjectState? ReopenState { get; set; }

    /// <summary>
    /// Se reabrir exige dizer por que. Saber o motivo facilita o trabalho de quem
    /// vai pegar o relato de volta. <b>Ainda nao tem leitor.</b>
    /// </summary>
    public bool ReopenRequiresComment { get; set; }

    /// <summary>
    /// Se o protocolo sozinho confirma e reabre, ou se as duas acoes exigem o link.
    /// Ler e inofensivo; reabrir mexe na fila do time. <b>Ainda nao tem leitor.</b>
    /// </summary>
    public bool TrackingCodeCanAct { get; set; }

    /// <summary>Se a nota e pedida ao confirmar. <b>Ainda nao tem leitor.</b></summary>
    public bool SatisfactionEnabled { get; set; }

    /// <summary>Como a escala aparece. <b>Ainda nao tem leitor.</b></summary>
    public SatisfactionStyleEnum SatisfactionStyle { get; set; }

    /// <summary>
    /// Se confirmar exige responder. Mesmo exigindo, "prefiro nao responder"
    /// continua existindo, fora da escala. <b>Ainda nao tem leitor.</b>
    /// </summary>
    public bool SatisfactionRequired { get; set; }

    /// <summary>
    /// Se o time pode devolver o relato pedindo informacao em vez de encerrar.
    /// <b>Ainda nao tem leitor.</b>
    /// </summary>
    public bool InfoRequestEnabled { get; set; }

    /// <summary>Dias sem resposta ate avisar quem relatou. <b>Ainda nao tem leitor.</b></summary>
    public int InfoRequestWarnDays { get; set; }

    /// <summary>
    /// Dias depois do aviso ate encerrar como "sem retorno". Encerrado assim
    /// continua reabrivel. <b>Ainda nao tem leitor.</b>
    /// </summary>
    public int InfoRequestCloseDays { get; set; }

    /// <summary>
    /// Como a opcao de aceitar duvidas vem marcada no formulario. <b>A escolha
    /// final e de quem relata, e nao do projeto</b> — isto e so o estado inicial da
    /// caixa. <b>Ainda nao tem leitor.</b>
    /// </summary>
    public bool AcceptsQuestionsDefault { get; set; }
}
