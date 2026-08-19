using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// A chave e o que liga o sistema do cliente ao nosso.
///
/// <para><b>Por que e tabela separada</b> em vez de duas colunas em
/// <see cref="Project"/>: chave precisa ser rotacionada e revogada, e guardar
/// quando cada uma valeu e o que permite investigar um incidente depois. Com duas
/// colunas, regenerar apagaria o rastro da anterior.</para>
///
/// <para><b>Os dois tipos nao sao guardados do mesmo jeito.</b> A publica vai
/// aparecer no site do cliente, entao guardar em claro esta correto. A secreta e
/// exibida uma unica vez e o banco fica so com o hash — se o painel conseguir
/// mostrar de novo, ela deixou de ser secreta. Uma trava no banco garante que
/// <see cref="Value"/> e <see cref="Hash"/> nunca venham juntos.</para>
/// </summary>
public class ProjectKey : PdsBaseEntity
{
    /// <summary>Projeto dono da chave.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>Tipo da chave. Define se o valor fica em claro ou como hash.</summary>
    public ProjectKeyTypeEnum Type { get; set; }

    /// <summary>Valor em claro. So para a chave publica; nulo na secreta.</summary>
    public string? Value { get; set; }

    /// <summary>Hash do valor. So para a chave secreta; nulo na publica.</summary>
    public string? Hash { get; set; }

    /// <summary>
    /// Primeiros caracteres da chave. Permite identificar qual chave e na lista sem
    /// revelar a secreta.
    /// </summary>
    public string Prefix { get; set; } = string.Empty;

    /// <summary>
    /// Quando a chave foi revogada, em UTC. Nulo enquanto vale.
    ///
    /// Nao confundir com <c>DeletedAt</c>: a revogada continua existindo de
    /// proposito, porque e ela que conta o historico; a apagada some da lista.
    /// </summary>
    public DateTime? RevokedAt { get; set; }

    /// <summary>Ultimo uso, em UTC. Ajuda a saber se da para revogar sem quebrar nada.</summary>
    public DateTime? LastUsedAt { get; set; }

    /// <summary>Uma chave vale quando nao foi revogada.</summary>
    public bool IsActive => RevokedAt is null;
}
