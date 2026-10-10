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
/// Os tipos de relato de um projeto — o que quem relata escolhe ao abrir a
/// ferramenta, com as palavras do time.
///
/// **Do projeto, e não fixos**, como as prioridades. O projeto nasce com três de
/// fábrica (Defeito, Melhoria, Dúvida), e o administrador renomeia, troca a cor e o
/// desenho, reordena, cria outros ou desativa. O membro lê a lista — é dela que sai o
/// filtro de tipo da tela de Trabalho.
///
/// **Cada tipo diz como o formulário pergunta**: até quatro perguntas curtas, a caixa
/// de texto livre com o texto dela, ou os dois — e nunca nada. E diz **em que coluna o
/// relato entra**; sem escolha, a primeira coluna ativa.
///
/// **Tipo não se apaga, se desativa.** Continua nos relatos que já o têm, marcado, e
/// sai da ferramenta. Fica sempre ao menos um ativo, e no máximo dez.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/report-types")]
[Produces("application/json")]
[Tags(SwaggerTags.ProjectReportTypes)]
public class ProjectReportTypesController : BaseController
{
    private readonly IProjectReportTypeService _reportTypeService;

    public ProjectReportTypesController(IProjectReportTypeService reportTypeService)
    {
        _reportTypeService = reportTypeService;
    }

    /// <summary>Lista os tipos de relato do projeto, na ordem da ferramenta.</summary>
    /// <remarks>
    /// Com os desativados no lugar deles: é a mesma lista que a reordenação reescreve.
    /// `IsActive` separa um do outro. `InitialStatePublicId` nulo quer dizer a primeira
    /// coluna ativa da fila.
    /// </remarks>
    /// <response code="200">Tipos de relato do projeto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectReportTypeViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var types = await _reportTypeService.ListAsync(publicId, cancellationToken);
            return Success(types, total: types.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Cria um tipo de relato, no fim da lista.</summary>
    /// <remarks>
    /// As perguntas em branco são descartadas; as que sobram vão de zero a quatro, até
    /// 120 caracteres cada, sem repetir. Sem pergunta nenhuma, a caixa livre tem de
    /// aparecer — e a caixa que aparece tem o texto dela.
    /// </remarks>
    /// <response code="200">O tipo criado.</response>
    /// <response code="400">Nome em branco ou comprido demais, sem cor ou sem desenho, perguntas demais, compridas ou repetidas, ou um tipo que não pede nada.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto ou coluna não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Já existe um tipo com este nome, o projeto já tem dez ativos, ou a coluna escolhida está aposentada.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectReportTypeViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(Guid publicId, [FromBody] CreateProjectReportTypeDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var type = await _reportTypeService.CreateAsync(publicId, dto, cancellationToken);
            return Success(type, "Tipo de relato criado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Reordena os tipos de relato.</summary>
    /// <remarks>
    /// O corpo traz **todos**, uma vez cada, inclusive os desativados — como na ordem
    /// das prioridades. O primeiro ativo é o pré-marcado da ferramenta quando ninguém
    /// escolheu outro. A rota vem antes da que recebe o identificador: `order` não é um
    /// GUID.
    /// </remarks>
    /// <response code="200">Os tipos, na ordem nova.</response>
    /// <response code="400">A lista não corresponde aos tipos do projeto.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPut("order")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectReportTypeViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Reorder(Guid publicId, [FromBody] ReorderProjectReportTypesDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var types = await _reportTypeService.ReorderAsync(publicId, dto, cancellationToken);
            return Success(types, "Ordem salva.", types.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Grava o tipo inteiro: nome, cor, desenho, perguntas, caixa e coluna.</summary>
    /// <remarks>
    /// **Substitui, e não altera campo a campo**: `InitialStatePublicId` nulo é um valor
    /// (a primeira coluna ativa), e num corpo parcial seria indistinguível de "não mexa".
    ///
    /// O passado não muda: os relatos que já chegaram guardam as perguntas como estavam
    /// no envio, e ficam na coluna em que estão. O nome novo aparece nos cards que já
    /// têm o tipo; o evento da entrada guarda o nome da época.
    /// </remarks>
    /// <response code="200">O tipo como ficou.</response>
    /// <response code="400">Nome em branco ou comprido demais, sem cor ou sem desenho, perguntas demais, compridas ou repetidas, ou um tipo que não pede nada.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto, tipo ou coluna não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Já existe outro tipo com este nome, ou a coluna escolhida está aposentada.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPut("{typePublicId:guid}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectReportTypeViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(Guid publicId, Guid typePublicId, [FromBody] UpdateProjectReportTypeDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var type = await _reportTypeService.UpdateAsync(publicId, typePublicId, dto, cancellationToken);
            return Success(type, "Tipo de relato salvo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Desativa um tipo de relato.</summary>
    /// <remarks>
    /// Continua nos relatos que já o têm, marcado, e sai da ferramenta e do pré-marcado
    /// — que cai no primeiro ativo. Desativar o desativado não é erro. **O último ativo
    /// não se desativa**: a ferramenta ficaria sem tipo para oferecer.
    /// </remarks>
    /// <response code="200">O tipo, desativado.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto ou tipo não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">É o único tipo ativo do projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost("{typePublicId:guid}/deactivate")]
    [ProducesResponseType(typeof(ApiResponse<ProjectReportTypeViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Deactivate(Guid publicId, Guid typePublicId, CancellationToken cancellationToken)
    {
        try
        {
            var type = await _reportTypeService.DeactivateAsync(publicId, typePublicId, cancellationToken);
            return Success(type, "Tipo de relato desativado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Reativa um tipo de relato desativado.</summary>
    /// <response code="200">O tipo, de volta à ferramenta.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto ou tipo não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">O projeto já tem dez tipos ativos.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost("{typePublicId:guid}/activate")]
    [ProducesResponseType(typeof(ApiResponse<ProjectReportTypeViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Activate(Guid publicId, Guid typePublicId, CancellationToken cancellationToken)
    {
        try
        {
            var type = await _reportTypeService.ActivateAsync(publicId, typePublicId, cancellationToken);
            return Success(type, "Tipo de relato reativado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
