using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>Emissao do token de sessao do painel.</summary>
public interface ITokenService
{
    /// <summary>
    /// Emite o token do usuario. Leva apenas os identificadores publicos: o token e
    /// legivel por quem o possui, e o id interno nao tem por que trafegar.
    /// </summary>
    (string AccessToken, DateTime ExpiresAt) Issue(User user);
}
