using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Como a ferramenta de relato aparece no site de um projeto.
///
/// São dez campos: se a ferramenta aparece, a cor, o canto, o tema, os quatro
/// textos e o que o seletor de tipo faz. Tudo que muda a **aparência** dela mora
/// aqui; o que muda para onde o relato vai mora nas chaves.
///
/// **Projeto sem configuração salva não é projeto sem configuração.** Ele usa os
/// padrões, e é isso que esta rota devolve — por isso ela nunca responde 404 para
/// um projeto que existe.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/widget-settings")]
[Produces("application/json")]
[Tags(SwaggerTags.WidgetSettings)]
public class ProjectWidgetSettingsController : BaseController
{
    private readonly IProjectWidgetSettingsService _widgetSettingsService;

    public ProjectWidgetSettingsController(IProjectWidgetSettingsService widgetSettingsService)
    {
        _widgetSettingsService = widgetSettingsService;
    }

    /// <summary>A configuração da ferramenta deste projeto.</summary>
    /// <remarks>
    /// Quem nunca abriu a tela recebe os **padrões**, e não uma resposta vazia: a
    /// ferramenta dele está no ar com esses valores, e dizer "não encontrado" sobre
    /// algo que está funcionando seria mentira.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">A configuração, salva ou padrão.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<WidgetSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _widgetSettingsService.GetAsync(publicId, cancellationToken);
            return Success(settings);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Substitui a configuração da ferramenta.</summary>
    /// <remarks>
    /// **Substitui, e não altera campo a campo** — os dez campos vão sempre juntos.
    /// O motivo é a cor: `AccentColor: null` é um valor, e quer dizer "use o acento
    /// do produto". Num corpo parcial ele seria indistinguível de "não mexa na
    /// cor", e voltar ao padrão viraria impossível de pedir.
    ///
    /// A cor é normalizada antes de gravar: vira minúscula e a forma de três
    /// dígitos é expandida para seis. O que não for cor é recusado — o quadro sabe
    /// cair no acento do produto, mas a tela não pode mostrar como salvo um valor
    /// que nunca vai aparecer no site.
    ///
    /// Desligar a ferramenta aqui **tira ela do site na próxima visita**, sem
    /// ninguém editar o HTML.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Os dez campos.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Configuração salva.</response>
    /// <response code="400">Campo ausente, texto em branco, longo demais, ou cor inválida.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpPut]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<WidgetSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Replace(Guid publicId, [FromBody] WidgetSettingsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _widgetSettingsService.ReplaceAsync(publicId, dto, cancellationToken);
            return Success(settings, "Configuração salva.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
