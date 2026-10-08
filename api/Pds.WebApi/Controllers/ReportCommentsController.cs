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
/// Os comentários de um relato — os que ficam entre o time e os escritos para quem
/// relatou.
///
/// **A separação é estrutural, e não visual.** Duas rotas de escrita, dois corpos,
/// duas tabelas e dois tipos de evento. Em nenhum ponto existe um campo que decide
/// se o texto é interno ou público: quem escreve escolhe a **rota**, e não um valor
/// dentro dela.
///
/// O motivo é o pior incidente possível para este produto. O comentário interno é
/// onde o time fala livremente — suspeita, culpa, prazo que não vai ser cumprido —,
/// e se ele vazar para a camada pública a pessoa que relatou lê o que o time diz
/// dela. Com um sinalizador, vazar é esquecer um filtro numa consulta, e o
/// esquecimento não dá erro em lugar nenhum: a resposta sai com uma linha a mais.
/// Com tabelas separadas, vazar exige escrever uma consulta que não existe e que
/// ninguém teria motivo para escrever.
///
/// **O comentário público tem leitor: quem relatou.** Ele lê na página de
/// acompanhamento, na conversa, junto das próprias respostas — e a tela do painel
/// diz isso a quem escreve.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/reports/{reportPublicId:guid}/comments")]
[Produces("application/json")]
[Tags(SwaggerTags.ReportComments)]
public class ReportCommentsController : BaseController
{
    private readonly IReportCommentService _reportCommentService;

    public ReportCommentsController(IReportCommentService reportCommentService)
    {
        _reportCommentService = reportCommentService;
    }

    /// <summary>Lista os comentários do relato, em duas listas separadas.</summary>
    /// <remarks>
    /// `Internal` e `Public` saem como **listas distintas**, e não como uma lista com
    /// um campo dizendo qual é qual. Uma lista só devolveria o interno para qualquer
    /// consumidor que esquecesse de filtrar.
    ///
    /// Os dois vêm do mais antigo para o mais novo: comentário é conversa, e
    /// conversa se lê na ordem em que aconteceu.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Os comentários do relato.</response>
    /// <response code="404">Relato ou projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<ReportCommentsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, Guid reportPublicId, CancellationToken cancellationToken)
    {
        try
        {
            var comments = await _reportCommentService.ListAsync(publicId, reportPublicId, cancellationToken);
            return Success(comments);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Escreve um comentário que fica entre o time.</summary>
    /// <remarks>
    /// **Este texto não sai desta tabela** — nem para o payload do evento. O evento
    /// registra que houve comentário, e não o que foi dito: evento só cresce e nunca
    /// é apagado, e copiar o texto para lá criaria uma segunda cópia do dado mais
    /// perigoso da aplicação numa tabela que não se consegue limpar.
    ///
    /// O autor é obrigatório e vem da sessão, nunca do corpo. Comentário interno sem
    /// autor não serve para decidir nada depois.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="dto">O texto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Comentário escrito.</response>
    /// <response code="400">Texto em branco ou comprido demais.</response>
    /// <response code="404">Relato ou projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpPost("internal")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<InternalCommentViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AddInternal(Guid publicId, Guid reportPublicId, [FromBody] CreateInternalCommentDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var comment = await _reportCommentService.AddInternalAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(comment, "Comentário interno salvo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Corrige um comentário que fica entre o time.</summary>
    /// <remarks>
    /// **Só quem escreveu** (403 para as outras pessoas, inclusive quem administra): o
    /// comentário é a palavra de alguém, com o nome dela em cima.
    ///
    /// As menções passam a ser as do texto novo: quem entrou é avisado no sino, e o
    /// aviso de quem saiu sai junto — corrigir o "@" na pessoa errada é isso. O
    /// comentário volta com `EditedAt`, e a tela o marca como editado. **Só o
    /// interno**: o comentário para quem relatou já saiu da empresa, e não se corrige.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="commentPublicId">Identificador público do comentário interno.</param>
    /// <param name="dto">O texto novo.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Comentário corrigido.</response>
    /// <response code="400">Texto em branco ou comprido demais.</response>
    /// <response code="403">O comentário é de outra pessoa.</response>
    /// <response code="404">Comentário, relato ou projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpPut("internal/{commentPublicId:guid}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<InternalCommentViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> EditInternal(Guid publicId, Guid reportPublicId, Guid commentPublicId, [FromBody] EditInternalCommentDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var comment = await _reportCommentService.EditInternalAsync(publicId, reportPublicId, commentPublicId, dto, cancellationToken);
            return Success(comment, "Comentário interno corrigido.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Apaga um comentário que fica entre o time.</summary>
    /// <remarks>
    /// **Só quem escreveu** (403 para as outras pessoas). Sai da conversa e da contagem
    /// da frente do card, e os avisos das menções dele saem do sino. A linha do
    /// histórico que diz que houve comentário fica: o histórico registra que houve, e
    /// não o que foi dito.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="commentPublicId">Identificador público do comentário interno.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Comentário apagado.</response>
    /// <response code="403">O comentário é de outra pessoa.</response>
    /// <response code="404">Comentário, relato ou projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpDelete("internal/{commentPublicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteInternal(Guid publicId, Guid reportPublicId, Guid commentPublicId, CancellationToken cancellationToken)
    {
        try
        {
            await _reportCommentService.DeleteInternalAsync(publicId, reportPublicId, commentPublicId, cancellationToken);
            return Success<object?>(null, "Comentário interno apagado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Escreve um comentário para quem relatou.</summary>
    /// <remarks>
    /// **É uma rota diferente, e não a mesma com um campo de visibilidade.** Um
    /// campo seria o sinalizador que as duas tabelas existem para evitar: bastaria
    /// um valor errado, vindo de qualquer lugar, para o texto interno acabar na
    /// tabela que vai ser lida de fora.
    ///
    /// **Quem relatou lê**, na página de acompanhamento: o que se escreve aqui sai da
    /// empresa.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="dto">O texto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Comentário escrito.</response>
    /// <response code="400">Texto em branco ou comprido demais.</response>
    /// <response code="404">Relato ou projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpPost("public")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<PublicCommentViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AddPublic(Guid publicId, Guid reportPublicId, [FromBody] CreatePublicCommentDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var comment = await _reportCommentService.AddPublicAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(comment, "Comentário para quem relatou salvo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
