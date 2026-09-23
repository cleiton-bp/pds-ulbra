using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Os arquivos que vieram com um relato, para o time.
///
/// **Autoriza antes de assinar, sempre.** O relato é procurado dentro da conta do
/// painel; de outra conta, nada volta e nenhuma assinatura chega a ser gerada. Uma
/// assinatura é uma autorização em forma de texto — gerar antes de conferir seria
/// entregar a chave e perguntar depois.
///
/// **Os endereços nascem nesta resposta e morrem em minutos.** Nenhum está guardado
/// em lugar nenhum, e pedir de novo gera outros. `ExpiresAt` é o que a tela usa
/// para pedir antes de a imagem quebrar. O vídeo vale mais que a imagem: ele é lido
/// em pedaços enquanto toca, e pausar não pode quebrar a reprodução.
///
/// **Só aparece o que foi confirmado.** Permissão pedida e não usada, ou arquivo
/// cujos bytes não conferiram, não existem para o time.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/reports/{reportPublicId:guid}/attachments")]
[Produces("application/json")]
[Tags(SwaggerTags.Reports)]
public class ReportAttachmentsController : BaseController
{
    private readonly IReportAttachmentService _attachmentService;

    public ReportAttachmentsController(IReportAttachmentService attachmentService)
    {
        _attachmentService = attachmentService;
    }

    /// <summary>Os anexos do relato, com endereço de leitura assinado na hora.</summary>
    /// <remarks>
    /// **O nome original só aparece aqui.** O time precisa dele para entender o que
    /// chegou; do lado de fora ele nunca sai.
    ///
    /// A resposta sai com `Cache-Control: no-store`: carrega endereços assinados, e
    /// guardados num proxy eles continuariam valendo até vencer.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Os anexos confirmados, na ordem em que entraram.</response>
    /// <response code="404">Projeto ou relato não existe, ou pertence a outra conta.</response>
    /// <response code="409">Não há armazenamento configurado nesta instalação.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<PanelAttachmentViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> List(Guid publicId, Guid reportPublicId, CancellationToken cancellationToken)
    {
        try
        {
            var anexos = await _attachmentService.ListForPanelAsync(publicId, reportPublicId, cancellationToken);
            Response.Headers.CacheControl = "no-store";
            return Success(anexos, total: anexos.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
