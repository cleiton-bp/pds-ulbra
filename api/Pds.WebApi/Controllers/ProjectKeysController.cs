using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Chaves de um projeto.
///
/// São duas, de naturezas diferentes: a **pública** identifica o projeto no
/// navegador e pode ser lida por qualquer um; a **secreta** autentica o servidor do
/// cliente e o banco guarda apenas o hash dela.
///
/// **Só administradores, inclusive para ler.** É a única leitura do projeto fechada
/// para o membro: as chaves são a credencial da integração, e o trabalho nos
/// relatos não precisa delas.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Administrator)]
[Route("projects/{publicId:guid}/keys")]
[Produces("application/json")]
[Tags(SwaggerTags.ProjectKeys)]
public class ProjectKeysController : BaseController
{
    private readonly IProjectKeyService _projectKeyService;

    public ProjectKeysController(IProjectKeyService projectKeyService)
    {
        _projectKeyService = projectKeyService;
    }

    /// <summary>Lista as chaves do projeto, inclusive as revogadas.</summary>
    /// <remarks>
    /// A chave pública vem com o valor preenchido. A secreta vem sempre com
    /// `Value: null`, e só com o prefixo — não é a tela que esconde, é o banco que
    /// não tem o valor para devolver.
    ///
    /// As revogadas continuam na lista de propósito: o histórico de quando cada
    /// chave valeu é o que permite investigar um incidente depois.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Chaves do projeto.</response>
    /// <response code="403">A pessoa está no projeto, mas as chaves são só dos administradores.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectKeyViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var keys = await _projectKeyService.ListAsync(publicId, cancellationToken);
            return Success(keys, total: keys.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Regenera a chave secreta.</summary>
    /// <remarks>
    /// Revoga a secreta atual e cria uma nova, devolvendo o valor **uma única vez**.
    /// A anterior não é sobrescrita: fica na lista como histórico, com a data em que
    /// deixou de valer.
    ///
    /// **É imediato e não tem desfazer.** As integrações que usam a chave anterior
    /// param de funcionar a partir daqui.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Chave nova, com o valor completo. Não será exibido de novo.</response>
    /// <response code="403">A pessoa está no projeto, mas as chaves são só dos administradores.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpPost("secret")]
    [ProducesResponseType(typeof(ApiResponse<RevealedSecretKeyViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RegenerateSecret(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var key = await _projectKeyService.RegenerateSecretAsync(publicId, cancellationToken);
            return Success(key, "Chave secreta gerada. A anterior foi revogada e esta não será exibida de novo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
