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
/// Quantos relatos o projeto aceita em pouco tempo, em quatro camadas — quem relata,
/// o mesmo IP, o mesmo endereço de origem e o projeto inteiro (na hora e no dia) — e
/// o intervalo mínimo entre dois relatos da mesma pessoa ou do mesmo IP.
///
/// **Passado um limite, o relato não é recusado seco**: a entrada pede o desafio
/// invisível, que a ferramenta resolve sozinha em um ou dois segundos. **No dobro**,
/// aquela camada pausa por 15 minutos, e quem administra recebe um aviso no sino — um
/// por pausa. O intervalo mínimo é recusado sem desafio.
///
/// **As contagens moram na memória do processo**, e nenhum IP vai para o banco: a API
/// conta certo enquanto for uma instância só, e reiniciar zera as contagens e as
/// pausas.
///
/// **Projeto sem configuração salva usa os de fábrica**, e é isso que a leitura
/// devolve — junto dos de fábrica e dos tetos do sistema (dez vezes o de fábrica).
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/report-limits")]
[Produces("application/json")]
[Tags(SwaggerTags.ReportLimits)]
public class ProjectReportLimitsController : BaseController
{
    private readonly IProjectReportLimitsService _limitsService;

    public ProjectReportLimitsController(IProjectReportLimitsService limitsService)
    {
        _limitsService = limitsService;
    }

    /// <summary>Os limites de relato do projeto.</summary>
    /// <remarks>
    /// `Values` são os que valem hoje — os salvos, ou os de fábrica; `Defaults`, os de
    /// fábrica; `Ceilings`, o maior valor aceito em cada um. `PauseMinutes` é quanto dura
    /// a pausa no dobro de um limite.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Os limites, salvos ou de fábrica.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<ReportLimitsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var limits = await _limitsService.GetAsync(publicId, cancellationToken);
            return Success(limits);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Substitui os limites de relato.</summary>
    /// <remarks>
    /// **Todos os campos vêm**, e nenhum assume o padrão quando falta: assumir mudaria
    /// um limite sem ninguém ter escolhido. Cada um vai de 1 ao teto; o intervalo
    /// mínimo vai de 0 (desligado) ao teto. O limite por dia não pode ser menor que o
    /// por hora. Vale a partir do próximo relato.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Os seis valores.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Limites salvos.</response>
    /// <response code="400">Campo ausente, fora da faixa, ou o dia menor que a hora.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPut]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportLimitsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Replace(Guid publicId, [FromBody] ReportLimitsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var limits = await _limitsService.ReplaceAsync(publicId, dto, cancellationToken);
            return Success(limits, "Limites salvos.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
