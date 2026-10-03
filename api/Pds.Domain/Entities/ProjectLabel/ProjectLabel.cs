using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Uma etiqueta do projeto — "pagamento", "celular", "cliente grande".
///
/// <para><b>Quem cria e o time, ao etiquetar</b>, como num quadro de cards: faltar
/// a etiqueta certa nao vira pedido ao administrador. O administrador organiza —
/// renomeia, troca a cor, apaga.</para>
///
/// <para><b>Apagar tira a etiqueta de todos os cards.</b> O que aconteceu continua
/// contado pelos eventos, que guardam o nome da epoca.</para>
/// </summary>
public class ProjectLabel : PdsBaseEntity
{
    /// <summary>Teto do nome: etiqueta e palavra, e nao frase.</summary>
    public const int MaxNameLength = 30;

    /// <summary>Projeto dono da etiqueta.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>O nome. Unico dentro do projeto, sem diferenciar maiuscula de minuscula.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>A cor, da paleta fixa.</summary>
    public CardColorEnum Color { get; set; }
}
