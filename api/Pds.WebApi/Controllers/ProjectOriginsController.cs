using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Endereços autorizados a abrir a ferramenta de relato de um projeto.
///
/// A chave pública fica visível no HTML do site do cliente e qualquer visitante
/// consegue lê-la. Sozinha, ela diz apenas qual projeto procurar — não de onde o
/// relato saiu. É esta lista que responde a segunda pergunta.
///
/// **A lista é conferida nas duas rotas que a ferramenta usa**: a que entrega a configuração
/// do quadro, para ele não abrir onde não devia, e a que recebe o relato, que é
/// onde a recusa de fato impede a gravação.
///
/// **E ela é grade de proteção, não muro.** A ferramenta abre num quadro servido
/// pelo nosso domínio, então a origem que o navegador carimba é a nossa, e a que a
/// página hospedeira informa é auto-declarada. Como quem informa é o carregador,
/// que é código nosso, a chave copiada para outro site é pega; quem falar direto
/// com a API declara o que quiser. O muro é o `frame-ancestors` montado a partir
/// desta lista, que precisa de um servidor servindo o documento do quadro para
/// montar o cabeçalho por projeto — e chega com o domínio próprio.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/origins")]
[Produces("application/json")]
[Tags(SwaggerTags.ProjectOrigins)]
public class ProjectOriginsController : BaseController
{
    private readonly IProjectOriginService _projectOriginService;

    public ProjectOriginsController(IProjectOriginService projectOriginService)
    {
        _projectOriginService = projectOriginService;
    }

    /// <summary>Lista os endereços autorizados do projeto.</summary>
    /// <remarks>
    /// Em ordem alfabética: a lista é consultada para conferir se um endereço está
    /// nela, e procurar é mais fácil do que lembrar quando cada um entrou.
    ///
    /// **Lista vazia não é "ninguém autorizado", e sim "ainda não restringi"**: o
    /// projeto aceita relato de qualquer endereço até a primeira linha entrar. A
    /// leitura contrária apagaria a ferramenta em toda instalação no ar no dia em
    /// que a conferência entrasse, e sem erro na tela de ninguém.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Endereços autorizados.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectOriginViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var origins = await _projectOriginService.ListAsync(publicId, cancellationToken);
            return Success(origins, total: origins.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Autoriza um endereço.</summary>
    /// <remarks>
    /// O domínio pode vir colado da barra do navegador: o esquema, o caminho e a
    /// barra final são descartados, e o que sobra é guardado em minúsculo. A porta,
    /// quando informada, faz parte — para o navegador, `site.com` e `site.com:3000`
    /// são endereços diferentes.
    ///
    /// Curinga não é aceito: em vez de `*.site.com`, informe `site.com` e ligue
    /// `AllowsSubdomains`.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Domínio a autorizar.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Endereço autorizado.</response>
    /// <response code="400">Domínio em branco ou fora do formato.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    /// <response code="409">Endereço já autorizado, ou limite do projeto atingido.</response>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectOriginViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(Guid publicId, [FromBody] CreateProjectOriginDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var origin = await _projectOriginService.CreateAsync(publicId, dto, cancellationToken);
            return Success(origin, "Domínio autorizado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Retira a autorização de um endereço.</summary>
    /// <remarks>
    /// A ferramenta para de abrir naquele endereço a partir da próxima carga da
    /// página. Os relatos que já chegaram de lá continuam onde estão.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="originPublicId">Identificador público do endereço.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Autorização retirada.</response>
    /// <response code="404">Projeto ou endereço não existe, ou pertence a outra conta.</response>
    [HttpDelete("{originPublicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid publicId, Guid originPublicId, CancellationToken cancellationToken)
    {
        try
        {
            await _projectOriginService.DeleteAsync(publicId, originPublicId, cancellationToken);
            return Success<object?>(null, "Domínio removido.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
