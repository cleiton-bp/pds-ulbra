namespace Pds.Domain.Filters;

/// <summary>
/// Qual recorte da lista de relatos responder.
///
/// <para>Existe como tipo, e nao como dois parametros soltos, por causa dos dois
/// nulos: <c>StateId</c> nulo significa coisas opostas conforme
/// <c>Restricted</c> — "nao filtre nada" ou "so os que ainda nao tem lugar na
/// fila". Como parametros separados, a combinacao errada compila.</para>
/// </summary>
/// <param name="Restricted">Falso devolve a fila inteira.</param>
/// <param name="StateId">O estado pedido; nulo com <c>Restricted</c> ligado quer dizer "sem estado".</param>
public readonly record struct ReportStateFilter(bool Restricted, long? StateId)
{
    /// <summary>A fila inteira, sem recorte.</summary>
    public static readonly ReportStateFilter All = new(false, null);

    /// <summary>
    /// So os relatos que ainda nao tem lugar na fila.
    ///
    /// <para>E um caso raro e nao um defeito: acontece quando o relato entrou num
    /// projeto sem nenhuma coluna ativa. Precisa existir como recorte justamente
    /// porque, sem ele, esses relatos so apareceriam na lista inteira — e a soma
    /// das colunas nunca bateria com o total, sem explicacao na tela.</para>
    /// </summary>
    public static readonly ReportStateFilter WithoutState = new(true, null);

    /// <summary>So os relatos de um estado.</summary>
    public static ReportStateFilter In(long stateId) => new(true, stateId);
}
