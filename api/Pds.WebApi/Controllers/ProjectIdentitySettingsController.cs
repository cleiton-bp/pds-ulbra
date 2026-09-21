using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Como quem abre um relato é identificado neste projeto.
///
/// **São três formas, e elas são excludentes.** No modo `Protocol` ninguém é
/// identificado, e quem escreveu volta pelo link. Em `PersonalCode` o sistema
/// sorteia um código que a pessoa guarda. `InheritedIdentity` está **adiado**: o
/// modo existe na configuração, nada o lê ainda, e quando voltar a identidade virá
/// assinada pelo sistema do cliente com uma chave assimétrica — nós guardamos só a
/// pública.
///
/// **É esta escolha que decide o que a visibilidade pode ser.** Sem identidade não
/// existe "o meu relato" — logo não existe lista pessoal, e não existe a opção "só
/// os meus" para o projeto escolher.
///
/// **Projeto sem configuração salva não é projeto sem configuração.** Ele usa o
/// padrão, e é isso que esta rota devolve — por isso ela nunca responde 404 para um
/// projeto que existe. Mesmo desenho da configuração da ferramenta e do ciclo.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/identity-settings")]
[Produces("application/json")]
[Tags(SwaggerTags.IdentitySettings)]
public class ProjectIdentitySettingsController : BaseController
{
    private readonly IProjectIdentitySettingsService _identitySettingsService;

    public ProjectIdentitySettingsController(IProjectIdentitySettingsService identitySettingsService)
    {
        _identitySettingsService = identitySettingsService;
    }

    /// <summary>O modo de identificação deste projeto.</summary>
    /// <remarks>
    /// Quem nunca abriu a tela recebe o **padrão** — `Protocol` —, e não uma
    /// resposta vazia: o projeto dele já se comporta desse jeito, e dizer "não
    /// encontrado" sobre algo que está funcionando seria mentira.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O modo, salvo ou padrão.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IdentitySettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _identitySettingsService.GetAsync(publicId, cancellationToken);
            return Success(settings);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Substitui o modo de identificação.</summary>
    /// <remarks>
    /// **Trocar de modo não reescreve o passado.** O relato que entrou sob outro
    /// modo continua como entrou, e continua abrindo pelo link — o modo decide o que
    /// acontece daqui para frente. Sem essa garantia, mudar a configuração tornaria
    /// ilegível o que já existia, e quem tinha o link perderia o relato por uma
    /// decisão que não foi dele.
    ///
    /// **O campo é obrigatório, e não assume o padrão quando falta.** Assumir faria
    /// uma requisição incompleta trocar o modo do projeto sem ninguém ter escolhido
    /// — e um projeto que identificava passaria a não identificar, em silêncio.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">O modo escolhido.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Modo salvo.</response>
    /// <response code="400">Modo ausente ou desconhecido.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpPut]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<IdentitySettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Replace(Guid publicId, [FromBody] IdentitySettingsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _identitySettingsService.ReplaceAsync(publicId, dto, cancellationToken);
            return Success(settings, "Modo de identificação salvo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
