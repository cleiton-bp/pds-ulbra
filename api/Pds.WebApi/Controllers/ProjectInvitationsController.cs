using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Convites, todos do administrador — inclusive a leitura: os enderecos convidados
/// sao de pessoas que ainda nao estao no time.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Administrator)]
[Route("projects/{publicId:guid}/invitations")]
[Produces("application/json")]
[Tags(SwaggerTags.ProjectInvitations)]
public class ProjectInvitationsController : BaseController
{
    private readonly IProjectInvitationService _invitationService;

    public ProjectInvitationsController(IProjectInvitationService invitationService)
    {
        _invitationService = invitationService;
    }

    /// <summary>Os convites abertos, e se este servidor manda convite.</summary>
    /// <remarks>
    /// Aberto é o convite nem aceito nem cancelado — vencido continua aberto, para
    /// poder ser reenviado. `CanInvite` falso diz que falta, neste servidor, o e-mail,
    /// a fila ou o endereço do painel (`UnavailableReason`).
    /// </remarks>
    /// <response code="200">Os convites e o que a tela precisa para convidar.</response>
    /// <response code="403">A pessoa está no projeto, mas não é administradora.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está nele.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<ProjectInvitationsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _invitationService.ListAsync(publicId, cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Convida alguém para o time.</summary>
    /// <remarks>
    /// O convite é gravado e o e-mail vai para a fila — a resposta não espera o servidor
    /// de e-mail. Se o envio falhar, o convite fica com `EmailStatus` `Failed`, e o motivo
    /// vai para o log. Para um endereço que já tem convite aberto, reenvia o mesmo, com
    /// o papel novo e prazo novo. Há um limite de convites por hora em cada projeto.
    /// </remarks>
    /// <response code="200">O convite, ainda com o e-mail na fila.</response>
    /// <response code="400">E-mail inválido ou papel não informado.</response>
    /// <response code="403">A pessoa está no projeto, mas não é administradora.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está nele.</response>
    /// <response code="409">Quem foi convidado já está no time ou é o dono; o servidor não manda convite; ou o limite por hora foi atingido.</response>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectInvitationViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(Guid publicId, [FromBody] CreateInvitationDto dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _invitationService.CreateAsync(publicId, dto, cancellationToken), "Convite enviado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Manda o convite de novo.</summary>
    /// <remarks>Com prazo novo. O link do e-mail anterior deixa de valer.</remarks>
    /// <response code="200">O convite, com o e-mail de novo na fila.</response>
    /// <response code="403">A pessoa está no projeto, mas não é administradora.</response>
    /// <response code="404">Projeto não existe, a pessoa não está nele, ou o convite não está aberto.</response>
    /// <response code="409">O servidor não manda convite, ou o limite por hora foi atingido.</response>
    [HttpPost("{invitationPublicId:guid}/resend")]
    [ProducesResponseType(typeof(ApiResponse<ProjectInvitationViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Resend(Guid publicId, Guid invitationPublicId, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _invitationService.ResendAsync(publicId, invitationPublicId, cancellationToken), "Convite reenviado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Cancela um convite aberto.</summary>
    /// <remarks>O link do e-mail deixa de valer.</remarks>
    /// <response code="200">Convite cancelado.</response>
    /// <response code="403">A pessoa está no projeto, mas não é administradora.</response>
    /// <response code="404">Projeto não existe, a pessoa não está nele, ou o convite não está aberto.</response>
    [HttpDelete("{invitationPublicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Revoke(Guid publicId, Guid invitationPublicId, CancellationToken cancellationToken)
    {
        try
        {
            await _invitationService.RevokeAsync(publicId, invitationPublicId, cancellationToken);
            return Success<object?>(null, "Convite cancelado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
