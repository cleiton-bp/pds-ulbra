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
/// As etiquetas de um projeto.
///
/// **Quem cria é o time, ao etiquetar um card** — como num quadro de cards, faltar a
/// etiqueta certa não vira pedido ao administrador. O administrador organiza:
/// renomeia, troca a cor e apaga. Apagar tira a etiqueta de todos os cards; o
/// histórico continua com o nome que ela tinha.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/labels")]
[Produces("application/json")]
[Tags(SwaggerTags.ProjectLabels)]
public class ProjectLabelsController : BaseController
{
    private readonly IProjectLabelService _labelService;

    public ProjectLabelsController(IProjectLabelService labelService)
    {
        _labelService = labelService;
    }

    /// <summary>Lista as etiquetas do projeto, em ordem de nome.</summary>
    /// <remarks>`CardCount` diz em quantos cards cada uma está — arquivados inclusive.</remarks>
    /// <response code="200">Etiquetas do projeto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectLabelViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var labels = await _labelService.ListAsync(publicId, cancellationToken);
            return Success(labels, total: labels.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Cria uma etiqueta — qualquer pessoa do time.</summary>
    /// <remarks>
    /// **O nome que já existe devolve a etiqueta que existe**, sem diferenciar
    /// maiúscula: quem digitou "Pagamento" queria a "pagamento" que já estava lá. A
    /// mensagem diz qual dos dois aconteceu.
    ///
    /// Sem `Color`, a etiqueta ganha a cor menos usada no projeto.
    /// </remarks>
    /// <response code="200">A etiqueta criada, ou a que já existia com este nome.</response>
    /// <response code="400">Nome em branco ou comprido demais, ou cor fora da paleta.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [MemberWrite("O time cria a etiqueta ao etiquetar um card: e trabalho, e nao configuracao.")]
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectLabelViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Create(Guid publicId, [FromBody] CreateProjectLabelDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var (label, created) = await _labelService.CreateAsync(publicId, dto, cancellationToken);
            return Success(label, created ? "Etiqueta criada." : "Esta etiqueta ja existia.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Muda o nome e a cor de uma etiqueta.</summary>
    /// <remarks>Vale em todos os cards que a têm. O histórico continua com o nome da época.</remarks>
    /// <response code="200">A etiqueta como ficou.</response>
    /// <response code="400">Nome em branco ou comprido demais, ou sem cor.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores organizam as etiquetas.</response>
    /// <response code="404">Projeto ou etiqueta não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Já existe outra etiqueta com este nome no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPut("{labelPublicId:guid}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectLabelViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(Guid publicId, Guid labelPublicId, [FromBody] UpdateProjectLabelDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var label = await _labelService.UpdateAsync(publicId, labelPublicId, dto, cancellationToken);
            return Success(label, "Etiqueta salva.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Apaga uma etiqueta, e a tira de todos os cards.</summary>
    /// <remarks>Cada card que a tinha ganha, na história, a saída dela, em nome de quem apagou; o que a história já contava continua com o nome que ela tinha.</remarks>
    /// <response code="200">Etiqueta apagada.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores organizam as etiquetas.</response>
    /// <response code="404">Projeto ou etiqueta não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpDelete("{labelPublicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid publicId, Guid labelPublicId, CancellationToken cancellationToken)
    {
        try
        {
            await _labelService.DeleteAsync(publicId, labelPublicId, cancellationToken);
            return Success<object?>(null, "Etiqueta apagada.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
