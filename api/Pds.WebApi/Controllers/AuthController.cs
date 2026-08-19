using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>Entrada e saída do painel.</summary>
[Route("auth")]
[Produces("application/json")]
[Tags(SwaggerTags.Auth)]
public class AuthController : BaseController
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    /// <summary>Entra com o Google e abre a sessão.</summary>
    /// <remarks>
    /// O painel faz o Sign-In do Google no navegador e envia aqui apenas o
    /// `id_token` recebido. A API confere esse token com o Google — assinatura,
    /// validade e destinatário — antes de acreditar em qualquer coisa dentro dele.
    ///
    /// **Não existe cadastro.** Se o `sub` do Google já for conhecido, a sessão
    /// apenas abre; se for novo, a conta e o usuário nascem nesta mesma chamada.
    ///
    /// O `AccessToken` devolvido vai no cabeçalho `Authorization: Bearer` de todas
    /// as demais rotas.
    /// </remarks>
    /// <response code="200">Sessão aberta. Devolve o token e quem entrou.</response>
    /// <response code="401">Token do Google ausente, inválido ou expirado.</response>
    /// <response code="429">Muitas tentativas a partir do mesmo IP.</response>
    [HttpPost("google")]
    [AllowAnonymous]
    [Consumes("application/json")]
    [EnableRateLimiting(Startup.AuthRateLimitPolicy)]
    [ProducesResponseType(typeof(ApiResponse<SignInViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> SignInWithGoogle([FromBody] GoogleSignInDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var session = await _authService.SignInWithGoogleAsync(dto, cancellationToken);
            return Success(session, "Sessão iniciada.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Encerra a sessão.</summary>
    /// <remarks>
    /// Responde 200 e nada mais. O token é autocontido: quem o tem continua podendo
    /// usá-lo até expirar, e não há como invalidá-lo daqui sem manter uma lista de
    /// tokens revogados.
    ///
    /// Quem descarta o token é o painel. A rota existe para haver um lugar único de
    /// "sair", e para ser onde a lista de revogados entra no dia em que derrubar
    /// sessão de verdade virar requisito.
    /// </remarks>
    /// <response code="200">Sessão encerrada do lado do painel.</response>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public IActionResult Logout() => Success<object?>(null, "Sessão encerrada.");
}
