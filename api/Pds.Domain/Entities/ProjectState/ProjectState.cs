namespace Pds.Domain.Entities;

/// <summary>
/// Um dos estados da fila de trabalho de um projeto — "Analise", "Corrigindo",
/// "Testando", o que o time quiser.
///
/// <para><b>Por que os estados sao do cliente, e nao nossos.</b> Se a lista fosse
/// fixa, definida aqui, a traducao entre o que o time faz por dentro e o que a
/// pessoa de fora acompanha viraria mapear os nossos proprios nomes nos nossos
/// proprios nomes — um passo que nao decide nada. E a fila de trabalho de cada
/// time e diferente: obrigar a nossa seria obrigar o time a mentir sobre o
/// processo dele.</para>
///
/// <para><b>Estado nao se apaga, se aposenta.</b> Por isso existe
/// <see cref="DeactivatedAt"/> em vez de uma remocao: relato antigo continua
/// apontando para ele, e o historico precisa continuar legivel. Aposentado, ele
/// nao recebe relato novo e some da lista de destinos, mas o nome permanece onde
/// ja foi usado.</para>
///
/// <para><b>Nao ha teto de quantos estados um projeto cria.</b> A ferramenta e do
/// feitio de um quadro de cards e o time pode querer separar o trabalho em muitas
/// faixas; um teto agora seria adivinhar o processo de quem usa.</para>
/// </summary>
public class ProjectState : PdsBaseEntity
{
    /// <summary>
    /// Teto do nome. Mora aqui, e nao no mapeamento, porque quem grava e quem
    /// valida precisam do mesmo numero e so o dominio e visivel para os dois —
    /// como em <see cref="ProjectWidgetSettings.MaxLauncherLabelLength"/>.
    ///
    /// <para>E curto de proposito: o nome vira rotulo de coluna numa tela de
    /// lista, e o que nao cabe ali nao e nome de estado, e frase.</para>
    /// </summary>
    public const int MaxNameLength = 40;

    /// <summary>
    /// Projeto dono do estado. A fila de trabalho e de cada sistema, e nao da
    /// conta: quem cuida de dois produtos raramente cuida dos dois do mesmo jeito.
    /// </summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// O nome que o time deu. Unico dentro do projeto, sem diferenciar maiuscula
    /// de minuscula.
    ///
    /// <para>Renomear <b>nao</b> reescreve o passado: o que ja aconteceu e contado
    /// pelos eventos, que guardam o nome que valia na epoca.</para>
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// A ordem na tela, escolhida pelo cliente. E coluna, e nao ordem alfabetica,
    /// porque fila de trabalho tem sequencia — "Analise" antes de "Pronto" nao e
    /// coincidencia do alfabeto.
    ///
    /// <para>Nao e unica: reordenar reescreve a lista inteira de uma vez, e exigir
    /// unicidade faria a troca de duas posicoes esbarrar no meio do caminho.</para>
    /// </summary>
    public int Position { get; set; }

    /// <summary>
    /// Nulo enquanto o estado aceita relato novo; preenchido para aposenta-lo sem
    /// apagar.
    /// </summary>
    public DateTime? DeactivatedAt { get; set; }

    /// <summary>O estado ainda esta em uso na fila de trabalho?</summary>
    public bool IsActive => DeactivatedAt is null;
}
