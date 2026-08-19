using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Projetos da conta da sessão.
///
/// Toda rota usa o identificador público na URL: o id interno não aparece em rota
/// nem em resposta. Projeto de outra conta responde 404, e não 403 — dizer
/// "existe, mas não é seu" já é contar que existe.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects")]
[Produces("application/json")]
[Tags(SwaggerTags.Projects)]
public class ProjectsController : BaseController
{
    private readonly IProjectService _projectService;

    public ProjectsController(IProjectService projectService)
    {
        _projectService = projectService;
    }

    /// <summary>Cria o projeto e gera o par de chaves.</summary>
    /// <remarks>
    /// A chave pública e a secreta nascem junto com o projeto, numa única gravação:
    /// ou entra tudo, ou não entra nada. Não existe projeto sem chave.
    ///
    /// **Esta é a única resposta do sistema que carrega o valor da chave secreta.**
    /// A partir da próxima requisição o banco só tem o hash dela, e nenhuma rota
    /// consegue revelá-la de novo.
    ///
    /// O nome é único dentro da conta, sem diferenciar maiúscula.
    /// </remarks>
    /// <response code="200">Projeto criado, com a chave pública e a secreta.</response>
    /// <response code="400">Nome não informado.</response>
    /// <response code="409">Já existe projeto com este nome na conta.</response>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectCreatedViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create([FromBody] CreateProjectDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var created = await _projectService.CreateAsync(dto, cancellationToken);
            return Success(created, "Projeto criado. Guarde a chave secreta: ela não será exibida de novo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Lista os projetos da conta.</summary>
    /// <remarks>
    /// Do mais recente para o mais antigo, incluindo os arquivados. O campo
    /// `Total` traz a contagem.
    /// </remarks>
    /// <response code="200">Projetos da conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectViewModel>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        try
        {
            var projects = await _projectService.ListAsync(cancellationToken);
            return Success(projects, total: projects.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Detalhe de um projeto.</summary>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Projeto encontrado.</response>
    /// <response code="404">Não existe, ou pertence a outra conta.</response>
    [HttpGet("{publicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<ProjectViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _projectService.GetAsync(publicId, cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Renomeia e/ou arquiva o projeto.</summary>
    /// <remarks>
    /// O que não vier no corpo fica como está — é um PATCH, não uma substituição.
    ///
    /// Arquivar não apaga nada: o projeto continua visível e consultável, só para de
    /// aceitar coisa nova.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Campos a alterar. Ambos opcionais.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Projeto atualizado.</response>
    /// <response code="400">Nome informado em branco.</response>
    /// <response code="404">Não existe, ou pertence a outra conta.</response>
    /// <response code="409">Já existe projeto com este nome na conta.</response>
    [HttpPatch("{publicId:guid}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(Guid publicId, [FromBody] UpdateProjectDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var project = await _projectService.UpdateAsync(publicId, dto, cancellationToken);
            return Success(project, "Projeto atualizado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
