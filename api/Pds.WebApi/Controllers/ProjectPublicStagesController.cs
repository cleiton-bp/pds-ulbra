using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// A jornada que quem relatou acompanha — os passos que aparecem do lado de fora.
///
/// **Não é a fila de trabalho com outro nome.** Por dentro o time precisa de
/// granularidade: "Code Review", "QA", "Aguardando merge". Quem está de fora não
/// precisa de nenhuma das três — precisa saber que o problema dele está sendo
/// corrigido. Vários estados de dentro caem numa etapa daqui, e é essa perda de
/// detalhe que é o produto.
///
/// **Entre três e sete.** O mínimo existe porque uma jornada de duas etapas não
/// conta uma história: vira "chegou" e "acabou". O máximo existe porque acima de
/// sete a jornada volta a ser o organograma interno, só que com palavras mais
/// bonitas. Os dois são conferidos na gravação, e não só escondidos na tela.
///
/// **O texto é do cliente, o desfecho é nosso.** O rótulo e a frase são escritos
/// por quem conhece o próprio usuário. Como um relato termina — feito, não será
/// feito, sem retorno, já existia — é uma lista curta e fixa: cada time inventando
/// o próprio vocabulário de encerramento levaria de volta ao jargão que esta camada
/// existe para esconder.
///
/// **Etapa terminal não quer dizer encerrado.** É onde o trabalho do time acaba.
/// Depois dela ainda vem a confirmação de quem relatou, que é ação da pessoa e não
/// estado do time — por isso terminal é uma marca, e não "a última da lista".
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/public-stages")]
[Produces("application/json")]
[Tags(SwaggerTags.ProjectPublicStages)]
public class ProjectPublicStagesController : BaseController
{
    private readonly IProjectPublicStageService _projectPublicStageService;

    public ProjectPublicStagesController(IProjectPublicStageService projectPublicStageService)
    {
        _projectPublicStageService = projectPublicStageService;
    }

    /// <summary>Lista a jornada pública do projeto.</summary>
    /// <remarks>
    /// Na ordem que o cliente definiu. Diferente da fila de trabalho, aqui não há
    /// aposentado para trazer junto: etapa pública se remove, e o que já passou por
    /// ela continua legível porque o evento guarda o rótulo que valia na época.
    ///
    /// **Pode vir vazia**, e isso não é erro: é o projeto criado antes de a jornada
    /// existir. `POST /public-stages/factory` preenche com o conjunto padrão.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Etapas do projeto.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectPublicStageViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var stages = await _projectPublicStageService.ListAsync(publicId, cancellationToken);
            return Success(stages, total: stages.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Acrescenta uma etapa no fim da jornada.</summary>
    /// <remarks>
    /// Entra no fim porque quem acrescenta um passo depois raramente o quer no
    /// começo — mandar para o topo mudaria a jornada de quem não pediu nada. Para
    /// mover, `PUT /public-stages/order`.
    ///
    /// `IsTerminal` exige `Outcome`, e `Outcome` exige `IsTerminal`: um fim sem
    /// desfecho é um fim sem explicação, e um desfecho no meio da jornada é um final
    /// que a linha do tempo não teria como desenhar.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Rótulo, frase, o que vem depois e as marcas da etapa.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Etapa criada.</response>
    /// <response code="400">Texto em branco, comprido demais, ou o par terminal/desfecho incompleto.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    /// <response code="409">A jornada já está no máximo de etapas, ou o rótulo se repete.</response>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectPublicStageViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(Guid publicId, [FromBody] SaveProjectPublicStageDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var stage = await _projectPublicStageService.CreateAsync(publicId, dto, cancellationToken);
            return Success(stage, "Etapa criada.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Preenche uma jornada vazia com o conjunto padrão.</summary>
    /// <remarks>
    /// Projeto novo já nasce com o conjunto; esta rota é para o projeto criado antes
    /// de a jornada existir.
    ///
    /// **Só funciona com a jornada vazia.** Deixá-la somar ao que já existe faria
    /// dela um jeito de duplicar rótulo — o pedido não é "acrescente o padrão", é
    /// "comece pelo padrão".
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">A jornada padrão, na ordem.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    /// <response code="409">A jornada já tem etapas.</response>
    [HttpPost("factory")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectPublicStageViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ApplyFactory(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var stages = await _projectPublicStageService.ApplyFactoryAsync(publicId, cancellationToken);
            return Success(stages, "Jornada preenchida com o conjunto padrão.", stages.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Reescreve a ordem da jornada inteira.</summary>
    /// <remarks>
    /// Uma chamada só, com **todas** as etapas, uma vez cada. Mover uma mexe na
    /// posição de todas entre a origem e o destino, e uma lista parcial não teria
    /// como dizer onde fica o que ficou de fora.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Os identificadores das etapas, da primeira à última.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">A jornada na ordem nova.</response>
    /// <response code="400">A lista não traz todas as etapas, uma vez cada.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpPut("order")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectPublicStageViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Reorder(Guid publicId, [FromBody] ReorderProjectPublicStagesDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var stages = await _projectPublicStageService.ReorderAsync(publicId, dto, cancellationToken);
            return Success(stages, "Ordem salva.", stages.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Reescreve uma etapa.</summary>
    /// <remarks>
    /// Todos os campos vêm juntos: é a tela daquela etapa sendo salva, e não um
    /// campo de cada vez.
    ///
    /// **O rótulo novo vale de agora em diante.** A linha do tempo já percorrida não
    /// muda: cada evento guarda o rótulo que valia quando aconteceu.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="stagePublicId">Identificador público da etapa.</param>
    /// <param name="dto">Rótulo, frase, o que vem depois e as marcas da etapa.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Etapa salva.</response>
    /// <response code="400">Texto em branco, comprido demais, ou o par terminal/desfecho incompleto.</response>
    /// <response code="404">Projeto ou etapa não existe, ou pertence a outra conta.</response>
    /// <response code="409">Outra etapa da jornada já tem este rótulo.</response>
    [HttpPut("{stagePublicId:guid}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectPublicStageViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(Guid publicId, Guid stagePublicId, [FromBody] SaveProjectPublicStageDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var stage = await _projectPublicStageService.UpdateAsync(publicId, stagePublicId, dto, cancellationToken);
            return Success(stage, "Etapa salva.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Tira a etapa da jornada.</summary>
    /// <remarks>
    /// Aqui existe remoção, e na fila de trabalho não existe. Não é descuido: o
    /// estado interno aposentado precisa continuar visível porque a tela do time
    /// mostra a fila inteira; a etapa pública removida não tem esse papel, e o que
    /// já passou por ela é contado pelos eventos.
    ///
    /// **Recusada quando a jornada ficaria abaixo do mínimo.** A mensagem diz o
    /// motivo em vez de só negar.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="stagePublicId">Identificador público da etapa.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Etapa removida.</response>
    /// <response code="404">Projeto ou etapa não existe, ou pertence a outra conta.</response>
    /// <response code="409">A jornada ficaria com menos que o mínimo de etapas.</response>
    [HttpDelete("{stagePublicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Remove(Guid publicId, Guid stagePublicId, CancellationToken cancellationToken)
    {
        try
        {
            await _projectPublicStageService.RemoveAsync(publicId, stagePublicId, cancellationToken);
            return Success<object?>(null, "Etapa removida.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
