using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// A fila de trabalho de um projeto — os estados por onde o relato passa do lado
/// de dentro.
///
/// **Quem define a lista é o cliente, e isso não é detalhe de customização.** Se os
/// estados fossem fixos, escritos por nós, a tradução entre o que o time faz por
/// dentro e o que a pessoa de fora acompanha viraria mapear os nossos próprios
/// nomes nos nossos próprios nomes — um passo que não decide nada. Cada time tem a
/// sua fila, e obrigar a nossa seria obrigar o time a descrever o processo dele com
/// as nossas palavras.
///
/// **Estado não se apaga, se aposenta.** Não existe rota de remoção: relato antigo
/// aponta para o estado, e um estado que some leva junto o sentido de tudo que
/// passou por ele. Aposentado, ele para de receber relato novo e sai da lista de
/// destinos, mas continua legível onde já foi usado.
///
/// **Não há teto de quantos estados cabem.** Quantas faixas o trabalho tem é
/// escolha de quem trabalha.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/states")]
[Produces("application/json")]
[Tags(SwaggerTags.ProjectStates)]
public class ProjectStatesController : BaseController
{
    private readonly IProjectStateService _projectStateService;

    public ProjectStatesController(IProjectStateService projectStateService)
    {
        _projectStateService = projectStateService;
    }

    /// <summary>Lista a fila de trabalho do projeto.</summary>
    /// <remarks>
    /// Na ordem que o cliente definiu, e **com os aposentados no lugar onde sempre
    /// estiveram**. Eles vêm junto porque esta é a mesma lista que a tela mostra e a
    /// mesma que a reordenação reescreve: escondê-los aqui faria a reordenação
    /// perder a posição de quem ficou de fora.
    ///
    /// `IsActive` é o que separa um caso do outro.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Estados do projeto.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectStateViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var states = await _projectStateService.ListAsync(publicId, cancellationToken);
            return Success(states, total: states.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Mostra onde cada tipo de relato cai ao entrar.</summary>
    /// <remarks>
    /// Devolve **os três tipos sempre**, escolhidos ou não — a tela precisa mostrar
    /// a pergunta inteira, e não só as respostas dadas.
    ///
    /// `StatePublicId` nulo quer dizer que o cliente nunca escolheu para aquele
    /// tipo, e aí vale o padrão: **o primeiro estado ativo da fila**. Não é
    /// configuração faltando, é configuração não feita — e o projeto funciona
    /// igual.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O destino de cada tipo.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet("initial")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectInitialStateViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ListInitial(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var initial = await _projectStateService.ListInitialAsync(publicId, cancellationToken);
            return Success(initial, total: initial.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Escolhe onde um tipo de relato passa a cair.</summary>
    /// <remarks>
    /// **Trocar o destino não mexe nos relatos que já entraram** — eles ficam onde
    /// estão. A escolha vale para o próximo que chegar.
    ///
    /// `StatePublicId` nulo **apaga** a escolha e devolve o tipo ao padrão, em vez
    /// de gravar uma escolha vazia. Assim "sem escolha" continua sendo um estado
    /// possível do projeto, e não algo que só existe até alguém abrir a tela.
    ///
    /// Um estado aposentado é recusado: mandar relato novo para ele seria desfazer
    /// pela porta dos fundos o que aposentar decidiu.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">O tipo e o estado de destino.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Destino salvo.</response>
    /// <response code="400">Tipo de relato ausente ou desconhecido.</response>
    /// <response code="404">Projeto ou estado não existe, ou pertence a outra conta.</response>
    /// <response code="409">O estado escolhido está aposentado.</response>
    [HttpPut("initial")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectInitialStateViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetInitial(Guid publicId, [FromBody] SetInitialStateDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var initial = await _projectStateService.SetInitialAsync(publicId, dto, cancellationToken);
            return Success(initial, "Destino salvo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Cria um estado no fim da fila.</summary>
    /// <remarks>
    /// O nome chega do jeito que foi escrito: só as bordas são aparadas e os espaços
    /// repetidos do meio viram um. A caixa é preservada — corrigi-la seria escolher
    /// pelo cliente como o processo dele se chama.
    ///
    /// O mesmo nome não entra duas vezes no projeto, e a comparação **ignora
    /// maiúsculas**: "Análise" e "análise" seriam duas colunas indistinguíveis na
    /// tela.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Nome do estado.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Estado criado.</response>
    /// <response code="400">Nome em branco ou comprido demais.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    /// <response code="409">Já existe um estado com este nome no projeto.</response>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectStateViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(Guid publicId, [FromBody] CreateProjectStateDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var state = await _projectStateService.CreateAsync(publicId, dto, cancellationToken);
            return Success(state, "Estado criado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Reordena a fila inteira.</summary>
    /// <remarks>
    /// O corpo traz **todos** os estados do projeto, do primeiro ao último, uma vez
    /// cada — inclusive os aposentados. Uma lista parcial não teria como dizer onde
    /// fica o que ficou de fora, e a posição dele acabaria sendo a antiga, que é
    /// justamente a que está sendo trocada.
    ///
    /// É uma chamada só, e não uma por estado, porque arrastar um item mexe na
    /// posição de todos entre a origem e o destino: em chamadas separadas, uma falha
    /// no meio deixaria a fila numa ordem que ninguém pediu.
    ///
    /// A rota vem antes da que recebe o identificador porque `order` não é um GUID —
    /// elas não se confundem.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Os estados na ordem nova.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Fila reordenada, na ordem nova.</response>
    /// <response code="400">A lista não corresponde aos estados do projeto.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpPut("order")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectStateViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Reorder(Guid publicId, [FromBody] ReorderProjectStatesDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var states = await _projectStateService.ReorderAsync(publicId, dto, cancellationToken);
            return Success(states, "Ordem salva.", states.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Renomeia um estado.</summary>
    /// <remarks>
    /// O nome novo vale de agora em diante. **O histórico não muda**: o que já
    /// aconteceu é contado pelos eventos, e cada um guarda o nome que valia quando
    /// aconteceu. Renomear "Testando" para "Em validação" não reescreve o passado
    /// para dizer que o relato esteve num estado que ainda não existia.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="statePublicId">Identificador público do estado.</param>
    /// <param name="dto">Nome novo.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Estado renomeado.</response>
    /// <response code="400">Nome em branco ou comprido demais.</response>
    /// <response code="404">Projeto ou estado não existe, ou pertence a outra conta.</response>
    /// <response code="409">Já existe um estado com este nome no projeto.</response>
    [HttpPut("{statePublicId:guid}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectStateViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Rename(Guid publicId, Guid statePublicId, [FromBody] RenameProjectStateDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var state = await _projectStateService.RenameAsync(publicId, statePublicId, dto, cancellationToken);
            return Success(state, "Estado renomeado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Aposenta um estado.</summary>
    /// <remarks>
    /// Ele sai da lista de destinos e para de receber relato novo, **mas continua
    /// existindo onde já foi usado**. É por isso que não existe remoção: um estado
    /// que some leva junto o sentido de tudo que passou por ele.
    ///
    /// Aposentar o que já está aposentado devolve 200 sem gravar nada — dois cliques
    /// seguidos não são um erro.
    ///
    /// **Mas aposentar a porta de entrada de um tipo é recusado**: o próximo relato
    /// daquele tipo cairia num estado aposentado, que é justamente o que aposentar
    /// existe para impedir. Escolha outro destino antes.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="statePublicId">Identificador público do estado.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Estado aposentado.</response>
    /// <response code="404">Projeto ou estado não existe, ou pertence a outra conta.</response>
    /// <response code="409">O estado é a entrada de algum tipo de relato.</response>
    [HttpPost("{statePublicId:guid}/deactivate")]
    [ProducesResponseType(typeof(ApiResponse<ProjectStateViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Deactivate(Guid publicId, Guid statePublicId, CancellationToken cancellationToken)
    {
        try
        {
            var state = await _projectStateService.DeactivateAsync(publicId, statePublicId, cancellationToken);
            return Success(state, "Estado aposentado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Traz um estado aposentado de volta para a fila.</summary>
    /// <remarks>
    /// Ele volta na posição em que estava, e volta a aceitar relato novo. Não há
    /// conflito de nome possível: o repetido é barrado entre todos os estados do
    /// projeto, aposentados inclusive.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="statePublicId">Identificador público do estado.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Estado de volta à fila.</response>
    /// <response code="404">Projeto ou estado não existe, ou pertence a outra conta.</response>
    [HttpPost("{statePublicId:guid}/activate")]
    [ProducesResponseType(typeof(ApiResponse<ProjectStateViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Activate(Guid publicId, Guid statePublicId, CancellationToken cancellationToken)
    {
        try
        {
            var state = await _projectStateService.ActivateAsync(publicId, statePublicId, cancellationToken);
            return Success(state, "Estado reativado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
