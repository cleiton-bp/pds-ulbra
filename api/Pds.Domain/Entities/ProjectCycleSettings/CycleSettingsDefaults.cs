using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O que vale quando ninguem configurou nada.
///
/// <para><b>Projeto novo tem de andar sem ninguem abrir esta tela.</b> E o criterio
/// que atravessa a etapa inteira: a configuracao existe para quem quer outra coisa,
/// e nao para quem precisa comecar.</para>
///
/// <para><b>Moram em codigo, e nao como valor padrao de coluna.</b> Assim existem
/// num lugar so — com o padrao no banco, mudar de ideia deixaria as linhas antigas
/// com o valor velho e as novas com o novo, e nenhuma delas saberia disso.</para>
/// </summary>
public static class CycleSettingsDefaults
{
    /// <summary>Ja decidido na etapa: o quadro que termina numa coluna de conclusao e o caso comum.</summary>
    public const ClosureTriggerEnum ClosureTrigger = ClosureTriggerEnum.LastColumn;

    /// <summary>
    /// Zero: o comportamento de hoje. Quem quiser a janela para desfazer liga.
    /// Ligar por padrao atrasaria a noticia de todo mundo para proteger o engano
    /// de alguns.
    /// </summary>
    public const int PublicDelayMinutes = 0;

    /// <summary>Verdadeiro: e o card que da nome a etapa.</summary>
    public const bool AllowsReopen = true;

    /// <summary>
    /// Nulo e a primeira coluna ativa — funciona sem ninguem configurar.
    ///
    /// <para><c>static readonly</c> e nao <c>const</c>: C# nao deixa declarar
    /// constante de tipo anulavel. Fica aqui assim mesmo, ao lado dos outros, para
    /// a lista dos padroes nao ter um buraco que so se descobre lendo o
    /// servico.</para>
    /// </summary>
    public static readonly long? ReopenStateId = null;

    /// <summary>Verdadeiro: o motivo e para quem vai trabalhar depois.</summary>
    public const bool ReopenRequiresComment = true;

    /// <summary>
    /// Falso: ler e chato, reabrir mexe na fila do time. Quem quiser afrouxar,
    /// liga — o contrario deixaria a fila aberta a quem so ouviu um protocolo.
    /// </summary>
    public const bool TrackingCodeCanAct = false;

    public const bool SatisfactionEnabled = true;
    public const SatisfactionStyleEnum SatisfactionStyle = SatisfactionStyleEnum.Stars;

    /// <summary>Falso: obrigatoria com fuga vira clique sem pensar, e a media mede o clique.</summary>
    public const bool SatisfactionRequired = false;

    public const bool InfoRequestEnabled = true;

    /// <summary>Sete e o costume, e os dois prazos somam as duas semanas do card.</summary>
    public const int InfoRequestWarnDays = 7;

    public const int InfoRequestCloseDays = 7;

    /// <summary>
    /// Marcado: desmarcado por padrao desligaria o pedido de informacao para todo
    /// mundo, e o passo inteiro nasceria sem uso.
    /// </summary>
    public const bool AcceptsQuestionsDefault = true;
}
