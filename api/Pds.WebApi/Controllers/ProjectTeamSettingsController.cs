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
[Route("projects/{publicId:guid}/team-settings")]
[Produces("application/json")]
[Tags(SwaggerTags.Team)]
public class ProjectTeamSettingsController : BaseController
{
    private readonly IProjectTeamSettingsService _teamSettingsService;

    public ProjectTeamSettingsController(IProjectTeamSettingsService teamSettingsService)
    {
        _teamSettingsService = teamSettingsService;
    }

    /// <summary>A configuração do time.</summary>
    /// <remarks>Sem nada salvo, vem o padrão: o convite vale 7 dias.</remarks>
    /// <response code="200">A configuração.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está nele.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<TeamSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _teamSettingsService.GetAsync(publicId, cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Grava a configuração do time.</summary>
    /// <remarks>O prazo vale para o próximo convite: quem já foi convidado mantém o que recebeu.</remarks>
    /// <response code="200">A configuração gravada.</response>
    /// <response code="400">Prazo fora de 1 a 30 dias.</response>
    /// <response code="403">A pessoa está no projeto, mas não é administradora.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está nele.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPut]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<TeamSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Replace(Guid publicId, [FromBody] TeamSettingsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _teamSettingsService.ReplaceAsync(publicId, dto, cancellationToken), "Configuração salva.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
