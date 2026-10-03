using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// As regras do ciclo, como a tela as manda.
///
/// <para><b>Vai inteira, e nao em pedacos.</b> Salvar campo a campo faria duas
/// abas abertas gravarem metades diferentes da mesma configuracao sem ninguem
/// notar; mandando tudo, a ultima a salvar ganha por inteiro — e e o que a pessoa
/// esta vendo na tela.</para>
///
/// <para><b>Todos os campos sao anulaveis no DTO, e nenhum e opcional de
/// verdade.</b> Anulavel aqui e o que permite responder "informe X" em vez de
/// gravar um <c>false</c> que ninguem escolheu — o mesmo desenho da configuracao
/// da ferramenta.</para>
/// </summary>
public class CycleSettingsDto
{
    /// <summary>Se o relato encerra ao cair na ultima coluna ativa, ou por um botao proprio.</summary>
    /// <example>LastColumn</example>
    public ClosureTriggerEnum? ClosureTrigger { get; set; }

    /// <summary>Quanto o lado publico espera antes de mudar, em minutos. Zero e sem espera.</summary>
    /// <example>0</example>
    public int? PublicDelayMinutes { get; set; }

    /// <summary>Se quem relatou pode reabrir.</summary>
    public bool? AllowsReopen { get; set; }

    /// <summary>
    /// Para qual coluna o relato volta ao ser reaberto. <b>Nulo e a primeira
    /// ativa</b> — e nesta configuracao nulo e uma escolha, e nao ausencia.
    /// </summary>
    public Guid? ReopenStatePublicId { get; set; }

    /// <summary>Se reabrir exige dizer por que.</summary>
    public bool? ReopenRequiresComment { get; set; }

    /// <summary>
    /// Se quem chega pelo codigo pessoal tambem confirma e reabre, ou se as duas
    /// acoes exigem o link. <b>Gravado e ignorado</b> ate confirmar, reabrir e
    /// responder aceitarem o codigo.
    /// </summary>
    public bool? TrackingCodeCanAct { get; set; }

    /// <summary>Se a nota e pedida ao confirmar.</summary>
    public bool? SatisfactionEnabled { get; set; }

    /// <summary>Como a escala de 1 a 5 aparece.</summary>
    /// <example>Stars</example>
    public SatisfactionStyleEnum? SatisfactionStyle { get; set; }

    /// <summary>Se confirmar exige responder.</summary>
    public bool? SatisfactionRequired { get; set; }

    /// <summary>Se o time pode devolver o relato pedindo informacao.</summary>
    public bool? InfoRequestEnabled { get; set; }

    /// <summary>Dias sem resposta ate avisar quem relatou.</summary>
    /// <example>7</example>
    public int? InfoRequestWarnDays { get; set; }

    /// <summary>Dias depois do aviso ate encerrar como sem retorno.</summary>
    /// <example>7</example>
    public int? InfoRequestCloseDays { get; set; }

    /// <summary>Como a opcao de aceitar duvidas vem marcada no formulario.</summary>
    public bool? AcceptsQuestionsDefault { get; set; }

    /// <summary>
    /// Se o time pode arquivar relato. Arquivar um relato aberto encerra junto, com
    /// desfecho e motivo — quem relatou le e pode reabrir ou finalizar.
    /// </summary>
    /// <example>false</example>
    public bool? AllowsReportArchiving { get; set; }

    /// <summary>
    /// Quantos dias a ultima coluna do quadro mostra; o card que entrou nela ha mais
    /// tempo continua na lista. Zero mostra todos. Ate 365.
    /// </summary>
    /// <example>14</example>
    public int? LastColumnVisibleDays { get; set; }

    /// <summary>
    /// Faltando ate quantos dias o prazo do card fica em destaque. Zero: so no
    /// proprio dia. Ate 30.
    /// </summary>
    /// <example>2</example>
    public int? DueSoonDays { get; set; }
}
