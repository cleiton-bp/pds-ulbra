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
/// Os relatos que vieram de um endereço bloqueado — marcados com "Origem bloqueada" —
/// e as duas decisões em lote sobre eles: manter, ou apagar de vez.
///
/// **Só de quem administra**, mesmo morando em `/reports`: apagar de vez não tem volta,
/// e manter decide sobre o bloqueio, que é configuração. Os cards alcançados são os
/// escolhidos na lista (`ReportIds`) ou todos os de um bloqueio (`BlockedOriginId`); o
/// que não está marcado fica de fora, e a resposta conta quantos.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/reports/blocked-origin")]
[Produces("application/json")]
[Tags(SwaggerTags.Reports)]
public class BlockedOriginReportsController : BaseController
{
    private readonly IBlockedOriginReportService _service;

    public BlockedOriginReportsController(IBlockedOriginReportService service)
    {
        _service = service;
    }

    /// <summary>Mantém os cards de origem bloqueada: a marca sai.</summary>
    /// <remarks>
    /// Grava em cada card marcado que o time decidiu ficar com ele
    /// (`blocked_origin_kept_at`). Vale para sempre — desbloquear e bloquear o endereço
    /// de novo não marca outra vez o que o time já manteve.
    /// </remarks>
    /// <response code="200">Quantos foram mantidos, e quantos dos pedidos não estavam marcados.</response>
    /// <response code="400">Nem `ReportIds` nem `BlockedOriginId`, os dois juntos, ou mais de 500 cards.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores decidem isto.</response>
    /// <response code="404">Projeto ou bloqueio não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost("keep")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<BlockedOriginReportsResultViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Keep(Guid publicId, [FromBody] BlockedOriginReportsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var resultado = await _service.KeepAsync(publicId, dto, cancellationToken);
            return Success(resultado, resultado.Affected == 1 ? "Card mantido." : "Cards mantidos.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Apaga de vez os cards de origem bloqueada. Sem volta.</summary>
    /// <remarks>
    /// **Exclusão real, e não linha marcada.** Sai o card e tudo que identifica quem
    /// relatou: texto, respostas, título, nome, contexto, comentários, encerramentos,
    /// pedidos de informação, etiquetas, anexos (a linha e o arquivo guardado), avisos do
    /// sino e vínculos com outros cards. **As subtarefas vão junto.** Ficam os eventos,
    /// sem o card e sem o caminho da página, para a contagem continuar existindo — e um
    /// evento do projeto, `reports_deleted_from_blocked_origin`, com quantos e de quais
    /// endereços. O link de acompanhamento de quem relatou passa a responder 404.
    ///
    /// `Confirmation` precisa ser a palavra `apagar`, ou o endereço de onde **todos** os
    /// cards vieram — o que a tela pede para digitar.
    /// </remarks>
    /// <response code="200">Quantos foram apagados, quantas subtarefas foram junto, e quantos dos pedidos não estavam marcados.</response>
    /// <response code="400">Sem a confirmação escrita, nem `ReportIds` nem `BlockedOriginId`, os dois juntos, ou mais de 500 cards.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores decidem isto.</response>
    /// <response code="404">Projeto ou bloqueio não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost("delete")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<BlockedOriginReportsResultViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid publicId, [FromBody] DeleteBlockedOriginReportsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var resultado = await _service.DeleteAsync(publicId, dto, cancellationToken);
            return Success(resultado, resultado.Affected == 1 ? "Card apagado." : "Cards apagados.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
