using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;

namespace Pds.WebApi.Controllers;

/// <summary>
/// A entrada do relato, vinda da ferramenta embutida no site do cliente.
///
/// **É a única área da API que funciona sem sessão.** Quem chega aqui é um
/// visitante anônimo do site de um cliente, e a única coisa que a requisição
/// carrega é a chave pública — que não autentica ninguém, apenas diz para qual
/// projeto o relato vai.
///
/// Por isso o `[AllowAnonymous]` está escrito, e não apenas subentendido pela
/// ausência do `[Authorize]`: no dia em que alguém definir uma política padrão de
/// autorização para a API inteira, esta rota precisa continuar aberta de propósito,
/// e não por esquecimento.
/// </summary>
[AllowAnonymous]
[Route("public/reports")]
[Produces("application/json")]
[Tags(SwaggerTags.PublicReports)]
public class PublicReportsController : BaseController
{
    private readonly IReportService _reportService;

    public PublicReportsController(IReportService reportService)
    {
        _reportService = reportService;
    }

    /// <summary>Abre um relato.</summary>
    /// <remarks>
    /// O projeto é resolvido pela chave pública do corpo. A resposta traz o
    /// **protocolo**, que a pessoa anota e repete, e o **token de acompanhamento**,
    /// que vai no link — e o token sai daqui uma única vez, porque o banco guarda
    /// apenas o hash dele.
    ///
    /// O que vier depois do `?` ou do `#` na rota é descartado antes de gravar: é
    /// ali que costumam viajar token, documento e e-mail.
    ///
    /// **A origem é conferida contra a lista do projeto, e continua não sendo
    /// prova.** A ferramenta abre num quadro do nosso domínio, então o endereço que
    /// chega aqui é informado pela própria página hospedeira — e quem informa é o
    /// carregador, que é código nosso. Por isso a lista pega a chave copiada para
    /// outro site, e não pega quem falar direto com esta rota. Projeto com a lista
    /// vazia aceita qualquer endereço, e quem não declara endereço passa.
    /// </remarks>
    /// <param name="dto">O relato, com a chave pública do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Relato aberto. Guarde o token: ele não será exibido de novo.</response>
    /// <response code="400">Texto em branco, longo demais, ou tipo não informado.</response>
    /// <response code="401">Chave pública ausente, desconhecida ou revogada.</response>
    /// <response code="403">O projeto está arquivado, ou o endereço declarado não está na lista dele.</response>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<CreatedReportViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create([FromBody] CreateReportDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var created = await _reportService.CreateAsync(dto, cancellationToken);
            return Success(created, "Relato recebido.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
