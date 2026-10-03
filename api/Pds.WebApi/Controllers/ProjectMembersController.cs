using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/members")]
[Produces("application/json")]
[Tags(SwaggerTags.Team)]
public class ProjectMembersController : BaseController
{
    private readonly IProjectMemberService _memberService;

    public ProjectMembersController(IProjectMemberService memberService)
    {
        _memberService = memberService;
    }

    /// <summary>Quem está no time.</summary>
    /// <remarks>
    /// O dono da conta primeiro, como administrador marcado com `IsAccountOwner`;
    /// depois quem entrou, na ordem em que entrou. Quem está no projeto lê — é a lista
    /// de onde o time escolhe com quem trabalhar.
    /// </remarks>
    /// <response code="200">O time.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está nele.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<TeamMemberViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var time = await _memberService.ListAsync(publicId, cancellationToken);
            return Success(time, total: time.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Muda o papel de alguém do time.</summary>
    /// <remarks>O dono não muda de papel: responde 409.</remarks>
    /// <response code="200">O papel novo.</response>
    /// <response code="400">Papel não informado.</response>
    /// <response code="403">A pessoa está no projeto, mas não é administradora.</response>
    /// <response code="404">Projeto não existe, a pessoa não está nele, ou quem foi indicado não está no time.</response>
    /// <response code="409">Quem foi indicado é o dono do projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPut("{userPublicId:guid}/role")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<TeamMemberViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ChangeRole(Guid publicId, Guid userPublicId, [FromBody] ChangeMemberRoleDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var membro = await _memberService.ChangeRoleAsync(publicId, userPublicId, dto, cancellationToken);
            return Success(membro, "Papel alterado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Tira alguém do time.</summary>
    /// <remarks>
    /// O acesso acaba na requisição seguinte da pessoa. O que ela escreveu nos relatos
    /// continua com o nome dela. O dono não sai: responde 409.
    /// </remarks>
    /// <response code="200">A pessoa saiu do time.</response>
    /// <response code="403">A pessoa está no projeto, mas não é administradora.</response>
    /// <response code="404">Projeto não existe, a pessoa não está nele, ou quem foi indicado não está no time.</response>
    /// <response code="409">Quem foi indicado é o dono do projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpDelete("{userPublicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Remove(Guid publicId, Guid userPublicId, CancellationToken cancellationToken)
    {
        try
        {
            await _memberService.RemoveAsync(publicId, userPublicId, cancellationToken);
            return Success<object?>(null, "Pessoa removida do time.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
