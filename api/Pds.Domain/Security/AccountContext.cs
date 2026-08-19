using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Domain.Security;

/// <summary>
/// Implementacao mutavel e por requisicao do <see cref="IAccountContext"/>. O
/// middleware preenche no inicio; dali em diante todo mundo so le.
///
/// Fica registrada duas vezes no container, como classe concreta (para o
/// middleware escrever) e como interface (para o resto ler). E o mesmo objeto: a
/// separacao e so para deixar claro quem tem permissao de preencher.
/// </summary>
public class AccountContext : IAccountContext
{
    public long? AccountId { get; set; }
    public Guid? AccountPublicId { get; set; }
    public long? UserId { get; set; }
    public Guid? UserPublicId { get; set; }

    public bool IsAuthenticated => UserId.HasValue && AccountId.HasValue;
}
