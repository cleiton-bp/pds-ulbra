using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Pds.Domain.Constants;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Service.Services;

/// <summary>
/// Emite o token de sessao do painel.
///
/// <para>O token carrega apenas os identificadores publicos do usuario e da conta.
/// Um JWT e assinado, nao cifrado: qualquer um que o tenha consegue ler o conteudo.
/// Colocar o id interno ali seria expor justamente o numero sequencial que a
/// modelagem faz questao de manter dentro de casa.</para>
/// </summary>
public class TokenService : ITokenService
{
    /// <summary>Identificador publico do usuario.</summary>
    public const string UserClaim = "uid";

    /// <summary>Identificador publico da conta.</summary>
    public const string AccountClaim = "acc";

    public (string AccessToken, DateTime ExpiresAt) Issue(User user)
    {
        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EnvironmentConstants.GetJwtSigningKey()));
        var expiresAt = DateTime.UtcNow.AddHours(EnvironmentConstants.GetJwtExpirationHours());

        var token = new JwtSecurityToken(
            issuer: EnvironmentConstants.GetJwtIssuer(),
            audience: EnvironmentConstants.GetJwtAudience(),
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.PublicId.ToString()),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                new Claim(UserClaim, user.PublicId.ToString()),
                new Claim(AccountClaim, user.Account.PublicId.ToString()),
            ],
            expires: expiresAt,
            signingCredentials: new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256));

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}
