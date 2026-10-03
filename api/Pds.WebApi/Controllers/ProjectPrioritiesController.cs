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
/// As prioridades de um projeto — o quanto cada card importa, com as palavras do
/// time.
///
/// **Do projeto, e não fixas**, como os estados. O projeto nasce com quatro de
/// fábrica (Baixa, Média, Alta, Urgente), e o administrador renomeia, troca a cor,
/// reordena ou cria outras. O membro lê a lista — é dela que escolhe a prioridade
/// do card.
///
/// **Prioridade não se apaga, se aposenta.** Continua nos cards que já a têm e sai da
/// lista de escolha. **O card nasce sem prioridade**: escolher é decisão do time.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/priorities")]
[Produces("application/json")]
[Tags(SwaggerTags.ProjectPriorities)]
public class ProjectPrioritiesController : BaseController
{
    private readonly IProjectPriorityService _priorityService;

    public ProjectPrioritiesController(IProjectPriorityService priorityService)
    {
        _priorityService = priorityService;
    }

    /// <summary>Lista as prioridades do projeto, da menos para a mais urgente.</summary>
    /// <remarks>
    /// Com as aposentadas no lugar delas: é a mesma lista que a reordenação reescreve.
    /// `IsActive` separa uma da outra.
    /// </remarks>
    /// <response code="200">Prioridades do projeto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectPriorityViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var priorities = await _priorityService.ListAsync(publicId, cancellationToken);
            return Success(priorities, total: priorities.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Cria uma prioridade, como a mais urgente.</summary>
    /// <response code="200">A prioridade criada.</response>
    /// <response code="400">Nome em branco ou comprido demais, ou sem cor.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Já existe uma prioridade com este nome no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectPriorityViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(Guid publicId, [FromBody] CreateProjectPriorityDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var priority = await _priorityService.CreateAsync(publicId, dto, cancellationToken);
            return Success(priority, "Prioridade criada.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Reordena as prioridades, da menos para a mais urgente.</summary>
    /// <remarks>
    /// O corpo traz **todas**, uma vez cada, inclusive as aposentadas — como na ordem
    /// dos estados. A rota vem antes da que recebe o identificador: `order` não é um
    /// GUID.
    /// </remarks>
    /// <response code="200">As prioridades, na ordem nova.</response>
    /// <response code="400">A lista não corresponde às prioridades do projeto.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPut("order")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectPriorityViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Reorder(Guid publicId, [FromBody] ReorderProjectPrioritiesDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var priorities = await _priorityService.ReorderAsync(publicId, dto, cancellationToken);
            return Success(priorities, "Ordem salva.", priorities.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Muda o nome e a cor de uma prioridade.</summary>
    /// <remarks>O histórico não muda: cada evento guarda o nome que valia quando aconteceu.</remarks>
    /// <response code="200">A prioridade como ficou.</response>
    /// <response code="400">Nome em branco ou comprido demais, ou sem cor.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto ou prioridade não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Já existe outra prioridade com este nome no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPut("{priorityPublicId:guid}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectPriorityViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(Guid publicId, Guid priorityPublicId, [FromBody] UpdateProjectPriorityDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var priority = await _priorityService.UpdateAsync(publicId, priorityPublicId, dto, cancellationToken);
            return Success(priority, "Prioridade salva.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Aposenta uma prioridade.</summary>
    /// <remarks>Continua nos cards que já a têm, e sai da lista de escolha. Aposentar a aposentada não é erro.</remarks>
    /// <response code="200">A prioridade, aposentada.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto ou prioridade não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost("{priorityPublicId:guid}/deactivate")]
    [ProducesResponseType(typeof(ApiResponse<ProjectPriorityViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Deactivate(Guid publicId, Guid priorityPublicId, CancellationToken cancellationToken)
    {
        try
        {
            var priority = await _priorityService.DeactivateAsync(publicId, priorityPublicId, cancellationToken);
            return Success(priority, "Prioridade aposentada.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Reativa uma prioridade aposentada.</summary>
    /// <response code="200">A prioridade, de volta à lista de escolha.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto ou prioridade não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost("{priorityPublicId:guid}/activate")]
    [ProducesResponseType(typeof(ApiResponse<ProjectPriorityViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Activate(Guid publicId, Guid priorityPublicId, CancellationToken cancellationToken)
    {
        try
        {
            var priority = await _priorityService.ActivateAsync(publicId, priorityPublicId, cancellationToken);
            return Success(priority, "Prioridade reativada.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
