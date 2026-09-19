using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Como o ciclo fecha neste projeto.
///
/// **Quase tudo do fim do relato é configuração, e é de propósito.** Quando o
/// relato encerra, quanto o lado público espera antes de mudar, se dá para
/// reabrir e para onde, e o que a pessoa responde no fim — nada disso é igual em
/// todo time, e fixar no código seria escolher por eles.
///
/// **Projeto sem configuração salva não é projeto sem configuração.** Ele usa os
/// padrões, e é isso que esta rota devolve — por isso ela nunca responde 404 para
/// um projeto que existe. Mesmo desenho da configuração da ferramenta.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/cycle-settings")]
[Produces("application/json")]
[Tags(SwaggerTags.CycleSettings)]
public class ProjectCycleSettingsController : BaseController
{
    private readonly IProjectCycleSettingsService _cycleSettingsService;

    public ProjectCycleSettingsController(IProjectCycleSettingsService cycleSettingsService)
    {
        _cycleSettingsService = cycleSettingsService;
    }

    /// <summary>As regras do ciclo deste projeto.</summary>
    /// <remarks>
    /// Quem nunca abriu a tela recebe os **padrões**, e não uma resposta vazia: o
    /// projeto dele já se comporta desses valores, e dizer "não encontrado" sobre
    /// algo que está funcionando seria mentira.
    ///
    /// `ReopenStatePublicId` nulo **é uma escolha**, e quer dizer "a primeira
    /// coluna ativa" — e não "ninguém escolheu".
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">As regras, salvas ou padrão.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<CycleSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _cycleSettingsService.GetAsync(publicId, cancellationToken);
            return Success(settings);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Substitui as regras do ciclo.</summary>
    /// <remarks>
    /// **Substitui, e não altera campo a campo.** Mesclar faria duas abas abertas
    /// gravarem metades diferentes da mesma configuração sem ninguém notar — e
    /// `ReopenStatePublicId: null` é um valor que quer dizer "a primeira ativa",
    /// indistinguível de "não mexa" num corpo parcial.
    ///
    /// **Trocar `ClosureTrigger` muda o que a rota de movimento exige.** Em
    /// `LastColumn`, cair na última coluna ativa passa a pedir desfecho e motivo;
    /// em `Button`, nenhum movimento encerra, e quem encerra é a rota própria.
    ///
    /// Coluna de destino da reabertura **aposentada é recusada**: reabrir joga o
    /// relato de volta na fila, e mandá-lo para uma coluna que ninguém olha seria
    /// perdê-lo de novo — que é o que a reabertura existe para evitar.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">As treze regras.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Regras salvas.</response>
    /// <response code="400">Campo ausente, número fora da faixa, ou coluna de reabertura aposentada.</response>
    /// <response code="404">Projeto ou coluna não existe, ou pertence a outra conta.</response>
    [HttpPut]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<CycleSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Replace(Guid publicId, [FromBody] CycleSettingsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _cycleSettingsService.ReplaceAsync(publicId, dto, cancellationToken);
            return Success(settings, "Regras salvas.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
