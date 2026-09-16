using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
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
/// **O comentário público ainda não tem leitor.** A camada que o relator lê vem
/// depois — por enquanto ele é público no nome, e a tela do painel diz isso em vez
/// de sugerir que a pessoa já está vendo.
/// </summary>
[Authorize]
[RequireAccount]
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
    /// <response code="404">Relato ou projeto não existe, ou pertence a outra conta.</response>
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
    /// <response code="404">Relato ou projeto não existe, ou pertence a outra conta.</response>
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

    /// <summary>Escreve um comentário para quem relatou.</summary>
    /// <remarks>
    /// **É uma rota diferente, e não a mesma com um campo de visibilidade.** Um
    /// campo seria o sinalizador que as duas tabelas existem para evitar: bastaria
    /// um valor errado, vindo de qualquer lugar, para o texto interno acabar na
    /// tabela que vai ser lida de fora.
    ///
    /// **Ele ainda não tem leitor.** A camada que o relator lê vem depois, e até lá
    /// este texto é público apenas no nome.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="dto">O texto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Comentário escrito.</response>
    /// <response code="400">Texto em branco ou comprido demais.</response>
    /// <response code="404">Relato ou projeto não existe, ou pertence a outra conta.</response>
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
