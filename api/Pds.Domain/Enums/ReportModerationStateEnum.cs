namespace Pds.Domain.Enums;

/// <summary>
/// Se este relato ja pode ser lido por quem nao o escreveu.
///
/// <para><b>Nao e configuracao do projeto: e a condicao de o publico existir.</b>
/// O risco do projeto publico nao e o nome de quem relatou — e o documento colado
/// no meio de um paragrafo, o numero do pedido, o print com dado de terceiro. Sem
/// alguem olhar antes, "publico" vira uma maneira de vazar o que a pessoa
/// escreveu as pressas.</para>
///
/// <para><b>Todo relato nasce <see cref="Pending"/>, inclusive em projeto
/// privado.</b> E a decisao que torna seguro trocar a visibilidade depois: se o
/// relato de projeto privado nascesse liberado, o dia em que alguem marcasse o
/// projeto como publico publicaria o historico inteiro de uma vez, sem ninguem ter
/// lido nada. Nascendo pendente, trocar a configuracao nao publica relato
/// nenhum — publica quem liberar, um a um.</para>
///
/// <para>No banco vira texto em snake_case (pending, approved, rejected).</para>
/// </summary>
public enum ReportModerationStateEnum
{
    /// <summary>
    /// Ninguem olhou ainda. <b>E como todo relato comeca.</b>
    ///
    /// <para>O time enxerga no painel e trabalha nele normalmente; o que nao
    /// acontece e aparecer em lista publica. Pendente nao e fila parada: e o
    /// estado normal de um relato que ninguem precisou publicar.</para>
    /// </summary>
    Pending,

    /// <summary>
    /// Alguem do time leu e liberou. <b>So daqui sai lista publica.</b>
    ///
    /// <para>Liberar e sobre <b>publicar</b>, e nao sobre o relato ser valido: um
    /// relato liberado num projeto privado continua sem aparecer para ninguem,
    /// porque a visibilidade do projeto tambem tem de permitir. As duas condicoes
    /// valem juntas, e nenhuma sozinha basta.</para>
    /// </summary>
    Approved,

    /// <summary>
    /// Alguem do time leu e decidiu que isto nao vai a publico.
    ///
    /// <para><b>Recusar nao apaga o relato, e nao fecha nada.</b> O time continua
    /// trabalhando nele, quem escreveu continua acompanhando pelo link, e o ciclo
    /// segue igual. O que a recusa diz e uma coisa so: isto nao aparece para
    /// estranhos.</para>
    ///
    /// <para>Quem relatou <b>nao e avisado</b> da recusa, e e de proposito: ela
    /// fala do que o time publica na vitrine dele, e transformar isso em recado
    /// convidaria a discutir a decisao editorial de outra pessoa.</para>
    /// </summary>
    Rejected,
}
