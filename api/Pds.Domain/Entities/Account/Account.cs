using Pds.ApiBase.Attributes;

namespace Pds.Domain.Entities;

/// <summary>
/// A conta e a dona dos dados: todo projeto, e tudo o que pende dele, pertence a
/// uma. Quem enxerga o que e decidido por projeto — o dono da conta enxerga todos
/// os projetos dela, e o time so os projetos em que entrou.
///
/// Fica separada de <see cref="User"/> de proposito. Cada pessoa tem uma conta
/// propria, que nasce no primeiro acesso, e pode trabalhar em projetos de outras
/// contas sem que nenhuma delas deixe de ser de quem e.
/// </summary>
public class Account : PdsBaseEntity
{
    /// <summary>Nome da conta, exibido no painel.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Quando a exclusao vira definitiva. Gravado no momento do pedido, e nao
    /// calculado a partir de <c>DeletedAt</c>, para que mudar a politica depois nao
    /// altere o prazo de quem ja pediu.
    /// </summary>
    public DateTime? PurgeAt { get; set; }

    /// <summary>
    /// Quando a identificacao foi removida. A partir daqui nenhuma linha da conta
    /// guarda dado pessoal, e o que sobra e contagem e tempo.
    /// </summary>
    public DateTime? AnonymizedAt { get; set; }

    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<User> Users { get; set; } = [];

    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<Project> Projects { get; set; } = [];
}
