using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Uma das prioridades de um projeto — "Baixa", "Media", "Alta", "Urgente", ou o
/// que o time quiser.
///
/// <para><b>Do projeto, e nao fixa</b>, pela mesma razao dos estados: cada time mede
/// urgencia com as proprias palavras. O projeto nasce com as quatro de fabrica, e o
/// administrador renomeia, troca a cor, reordena ou cria outras.</para>
///
/// <para><b>Prioridade nao se apaga, se aposenta</b>, como o estado: card antigo
/// continua apontando para ela, e o historico continua legivel. Aposentada, ela some
/// da lista de escolha, mas fica onde ja estava.</para>
///
/// <para><b>O card nasce sem prioridade.</b> Ela e uma decisao de alguem do time, e
/// uma prioridade de fabrica no card novo faria "media" querer dizer "ninguem olhou".</para>
/// </summary>
public class ProjectPriority : PdsBaseEntity
{
    /// <summary>Teto do nome, o mesmo do estado: o nome vira etiqueta na linha do card.</summary>
    public const int MaxNameLength = 40;

    /// <summary>Projeto dono da prioridade.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// O nome que o time deu. Unico dentro do projeto, sem diferenciar maiuscula de
    /// minuscula. Renomear nao reescreve o passado: o evento guarda o nome da epoca.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>A cor, da paleta fixa.</summary>
    public CardColorEnum Color { get; set; }

    /// <summary>
    /// A ordem na tela, da menos para a mais urgente, escolhida pelo time. Nao e
    /// unica: reordenar reescreve a lista inteira de uma vez.
    /// </summary>
    public int Position { get; set; }

    /// <summary>Nulo enquanto a prioridade pode ser escolhida; preenchido para aposenta-la.</summary>
    public DateTime? DeactivatedAt { get; set; }

    /// <summary>A prioridade ainda e oferecida?</summary>
    public bool IsActive => DeactivatedAt is null;
}
