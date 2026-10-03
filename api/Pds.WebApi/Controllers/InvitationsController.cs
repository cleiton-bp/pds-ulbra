using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// O lado de quem foi convidado. Fica fora de <c>projects/{publicId}</c> de
/// proposito: quem aceita ainda nao esta no projeto, e a rota dele responderia
/// "nao encontrado". O que prende o convite a pessoa e o link — 256 bits, so dentro
/// do e-mail — mais o Google dela, conferido contra o endereco convidado.
/// </summary>
[Authorize]
[RequireAccount]
[Route("invitations")]
[Produces("application/json")]
[Tags(SwaggerTags.Invitations)]
public class InvitationsController : BaseController
{
    private readonly IProjectInvitationService _invitationService;

    public InvitationsController(IProjectInvitationService invitationService)
    {
        _invitationService = invitationService;
    }

    /// <summary>O convite do link, para a pessoa logada.</summary>
    /// <remarks>
    /// O link vai no corpo, e não na URL — URL acaba em log de servidor. Com a conta
    /// convidada, vêm o projeto, quem convidou, o papel e o prazo; com outra conta,
    /// `Status` `WrongAccount` e só uma pista do endereço convidado, sem nada do projeto.
    /// </remarks>
    /// <response code="200">O que fazer com o convite.</response>
    /// <response code="401">Sem sessão.</response>
    /// <response code="404">O link não vale: não existe, foi cancelado ou trocado por um reenvio.</response>
    [HttpPost("preview")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<InvitationPreviewViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Preview([FromBody] InvitationTokenDto dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _invitationService.PreviewAsync(dto, cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Aceita o convite: a pessoa logada entra no time.</summary>
    /// <remarks>
    /// Exige o Google do mesmo endereço do convite, confirmado pelo Google. Aceitar de
    /// novo não é erro: devolve o projeto. O acesso vale a partir da requisição seguinte.
    /// </remarks>
    /// <response code="200">O projeto em que a pessoa entrou.</response>
    /// <response code="401">Sem sessão.</response>
    /// <response code="403">A conta não é a do endereço convidado, ou o Google não confirmou o e-mail.</response>
    /// <response code="404">O link não vale: não existe, foi cancelado ou trocado por um reenvio.</response>
    /// <response code="409">O convite venceu.</response>
    [HttpPost("accept")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<AcceptedInvitationViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Accept([FromBody] InvitationTokenDto dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _invitationService.AcceptAsync(dto, cancellationToken), "Você entrou no time.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
