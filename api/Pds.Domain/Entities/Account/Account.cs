using Pds.ApiBase.Attributes;

namespace Pds.Domain.Entities;

/// <summary>
/// A conta e a fronteira de isolamento do sistema: todo dado pertence a uma, e
/// nenhuma consulta atravessa de uma para outra.
///
/// Fica separada de <see cref="User"/> de proposito. Hoje e uma pessoa por conta,
/// mas quem opera nao e necessariamente quem e dono, e no dia em que alguem quiser
/// convidar um colega a separacao ja existe. Criar a entidade agora custa uma
/// tabela; criar depois custa reescrever o isolamento inteiro.
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
