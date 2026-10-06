using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// O bilhete da conexão em tempo real. A conexão em si é o hub, em
/// <c>/realtime/hub</c> — fora do Swagger, que só descreve a REST.
/// </summary>
[Authorize]
[RequireAccount]
[Route("realtime")]
[Produces("application/json")]
[Tags(SwaggerTags.Session)]
public class RealtimeController : BaseController
{
    private readonly IAuthService _authService;

    public RealtimeController(IAuthService authService)
    {
        _authService = authService;
    }

    /// <summary>Um bilhete para abrir a conexão em tempo real.</summary>
    /// <remarks>
    /// Vale um minuto e só abre o hub (<c>/realtime/hub?access_token=...</c>): nenhuma
    /// outra rota o aceita, e o hub não aceita o token da sessão. Assim o token da
    /// sessão nunca vai no endereço, que fica gravado em log. O painel pede um a cada
    /// conexão e a cada reconexão.
    /// </remarks>
    /// <response code="200">O bilhete, e até quando ele abre a conexão.</response>
    /// <response code="401">Sem sessão, ou sessão vencida.</response>
    [HttpPost("ticket")]
    [ProducesResponseType(typeof(ApiResponse<RealtimeTicketViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Ticket(CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _authService.IssueRealtimeTicketAsync(cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
