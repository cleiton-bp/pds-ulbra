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
/// As sprints do projeto. Planejar, iniciar e concluir e trabalho do time — qualquer
/// pessoa do projeto; ligar as sprints e do administrador, em Sprints.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/sprints")]
[Produces("application/json")]
[Tags(SwaggerTags.Sprints)]
public class SprintsController : BaseController
{
    private readonly ISprintService _sprintService;

    public SprintsController(ISprintService sprintService)
    {
        _sprintService = sprintService;
    }

    /// <summary>As sprints que não foram concluídas — e, com `closed=true`, também as concluídas.</summary>
    /// <remarks>
    /// A em andamento primeiro, depois as planejadas, pelo número — cada uma com os
    /// cards (sem as subtarefas e o arquivo), os que terminaram e os pontos, planejados
    /// e feitos.
    ///
    /// **`closed=true` traz também as concluídas**, depois das abertas, da mais recente
    /// para a mais antiga, com os números do que ficou nelas: é o que o filtro de sprint
    /// da lista oferece (a lista aceita a concluída em `sprint`). Sem o parâmetro, ou
    /// com `false`, só as que não fecharam, como sempre.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="closed">Também as concluídas, depois das abertas.</param>
    /// <param name="cancellationToken">Cancelamento da requisição.</param>
    /// <response code="200">As sprints.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está nele.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<SprintViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, [FromQuery] bool closed = false, CancellationToken cancellationToken = default)
    {
        try
        {
            return Success(await _sprintService.ListAsync(publicId, closed, cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Cria uma sprint planejada.</summary>
    /// <remarks>
    /// Sem nome, ela se chama Sprint e o número; sem datas, começa logo depois da última
    /// que não foi concluída (ou hoje) e dura o padrão do projeto. **Hoje é o `Today` do
    /// pedido**, o dia no relógio de quem cria; sem ele, ou a mais de um dia do relógio do
    /// servidor, o dia em UTC. Só com as sprints ligadas (409).
    /// </remarks>
    /// <response code="200">A sprint criada.</response>
    /// <response code="400">Nome comprido, objetivo comprido ou datas fora de ordem.</response>
    /// <response code="409">O projeto não trabalha em sprints.</response>
    [HttpPost]
    [MemberWrite("Planejar, iniciar e concluir sprint e trabalho do time, como mover card; ligar as sprints e que e configuracao, em Sprints.")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<SprintViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(Guid publicId, [FromBody] SaveSprintDto dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _sprintService.CreateAsync(publicId, dto, cancellationToken), "Sprint criada.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Muda o nome, o objetivo e as datas.</summary>
    /// <remarks>Inteiro: nome e as duas datas obrigatórios; o objetivo vazio apaga. A sprint concluída não muda (409).</remarks>
    /// <response code="200">A sprint como ficou.</response>
    /// <response code="400">Sem nome ou datas, ou datas fora de ordem.</response>
    /// <response code="404">Sprint ou projeto não existe aqui.</response>
    /// <response code="409">A sprint já foi concluída.</response>
    [HttpPut("{sprintPublicId:guid}")]
    [MemberWrite("Planejar, iniciar e concluir sprint e trabalho do time, como mover card; ligar as sprints e que e configuracao, em Sprints.")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<SprintViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(Guid publicId, Guid sprintPublicId, [FromBody] SaveSprintDto dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _sprintService.UpdateAsync(publicId, sprintPublicId, dto, cancellationToken), "Sprint salva.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Inicia uma sprint planejada.</summary>
    /// <remarks>
    /// **Uma em andamento por vez**: com outra em andamento, 409. O corpo é opcional —
    /// o nome, o objetivo e as datas que vierem valem para a sprint que começa. **Sem
    /// datas, ela começa hoje e dura o padrão do projeto**: as datas planejadas eram
    /// previsão e não contam. Hoje é o `Today` do pedido, o dia no relógio de quem inicia;
    /// sem ele, o dia em UTC. A partir daqui, o quadro mostra só ela.
    /// </remarks>
    /// <response code="200">A sprint em andamento.</response>
    /// <response code="404">Sprint ou projeto não existe aqui.</response>
    /// <response code="409">Outra em andamento, a sprint não é planejada, ou o projeto não trabalha em sprints.</response>
    [HttpPost("{sprintPublicId:guid}/start")]
    [MemberWrite("Planejar, iniciar e concluir sprint e trabalho do time, como mover card; ligar as sprints e que e configuracao, em Sprints.")]
    [ProducesResponseType(typeof(ApiResponse<SprintViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Start(Guid publicId, Guid sprintPublicId, [FromBody] SaveSprintDto? dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _sprintService.StartAsync(publicId, sprintPublicId, dto, cancellationToken), "Sprint iniciada.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Conclui a sprint em andamento.</summary>
    /// <remarks>
    /// **O que não terminou vai para o destino escolhido** — `Backlog`, `Sprint` (uma
    /// planejada, em `SprintPublicId`) ou `NewSprint` (uma planejada que nasce agora,
    /// depois das outras planejadas, ou a partir de hoje — o `Today` do pedido) —, no fim
    /// da lista, com as subtarefas. O que terminou fica na sprint concluída. A resposta
    /// traz os números de quando foi concluída e quantos foram.
    /// </remarks>
    /// <response code="200">A sprint concluída, quantos foram e o destino.</response>
    /// <response code="400">Sem destino, ou sem a sprint de destino.</response>
    /// <response code="404">Sprint ou projeto não existe aqui.</response>
    /// <response code="409">A sprint não está em andamento, ou o destino não é uma planejada.</response>
    [HttpPost("{sprintPublicId:guid}/close")]
    [MemberWrite("Planejar, iniciar e concluir sprint e trabalho do time, como mover card; ligar as sprints e que e configuracao, em Sprints.")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<CloseSprintResultViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Close(Guid publicId, Guid sprintPublicId, [FromBody] CloseSprintDto dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _sprintService.CloseAsync(publicId, sprintPublicId, dto, cancellationToken), "Sprint concluída.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Apaga uma sprint planejada.</summary>
    /// <remarks>Os cards dela voltam para o fim do backlog. A em andamento se conclui, e a concluída fica (409).</remarks>
    /// <response code="200">Apagada.</response>
    /// <response code="404">Sprint ou projeto não existe aqui.</response>
    /// <response code="409">A sprint não é planejada.</response>
    [HttpDelete("{sprintPublicId:guid}")]
    [MemberWrite("Planejar, iniciar e concluir sprint e trabalho do time, como mover card; ligar as sprints e que e configuracao, em Sprints.")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(Guid publicId, Guid sprintPublicId, CancellationToken cancellationToken)
    {
        try
        {
            await _sprintService.DeleteAsync(publicId, sprintPublicId, cancellationToken);
            return Success<object?>(null, "Sprint apagada.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
