using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>Usuário e conta da sessão atual.</summary>
[Authorize]
[RequireAccount]
[Route("me")]
[Produces("application/json")]
[Tags(SwaggerTags.Session)]
public class MeController : BaseController
{
    private readonly IAuthService _authService;

    public MeController(IAuthService authService)
    {
        _authService = authService;
    }

    /// <summary>Quem está logado e em qual conta.</summary>
    /// <remarks>
    /// É a primeira chamada do painel ao abrir: serve para saber se a sessão
    /// guardada no navegador ainda vale e para preencher o cabeçalho com o nome e a
    /// foto.
    ///
    /// A conta vem sempre da sessão. Não há parâmetro para consultar outra.
    /// </remarks>
    /// <response code="200">Usuário e conta da sessão.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<MeViewModel>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _authService.GetCurrentAsync(cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
