using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;

namespace Pds.WebApi.Controllers;

/// <summary>
/// O relato entrando, e o relato sendo acompanhado por quem o escreveu. As duas
/// pontas públicas do mesmo relato, e **nenhuma delas tem sessão**.
///
/// **As duas credenciais aqui são de naturezas opostas**, e confundi-las é o erro
/// a evitar. Na entrada, a chave pública não autentica ninguém: ela apenas diz
/// para qual projeto o relato vai, e está à vista no HTML do site do cliente. No
/// acompanhamento, o token do link **é** uma credencial — ele prova que aquele
/// relato é de quem o apresenta, é conferido em tempo constante e existe uma vez
/// só.
///
/// Por isso o `[AllowAnonymous]` está escrito, e não apenas subentendido pela
/// ausência do `[Authorize]`: no dia em que alguém definir uma política padrão de
/// autorização para a API inteira, estas rotas precisam continuar abertas de
/// propósito, e não por esquecimento.
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

    /// <summary>Abre o acompanhamento de um relato.</summary>
    /// <remarks>
    /// A página pública de acompanhamento chama esta rota com o protocolo e o token
    /// que saíram da criação do relato. **O protocolo identifica e o token abre**: o
    /// protocolo é curto e falado de propósito, logo adivinhável, e sozinho ele não
    /// abre nada.
    ///
    /// **Por que um `POST` para uma leitura.** O token é um segredo, e segredo em
    /// query string entra no log do servidor, no histórico do navegador e no
    /// `Referer` que sai da página — no corpo, não entra em nenhum dos três. E a
    /// chamada não é leitura pura: ela grava o evento de visualização, que é o dado
    /// da pesquisa sobre o relator voltar para olhar.
    ///
    /// **Protocolo inexistente e token errado recebem a mesma recusa 404**, com a
    /// mesma mensagem. Responder diferente contaria a quem sonda que acertou metade
    /// — e 404 em vez de 403 pela mesma razão de sempre aqui: confirmar que o
    /// relato existe já é informação.
    ///
    /// **A resposta traz a jornada**, na ordem, com o passo em que o relato está e as
    /// datas em que ele chegou a cada um. As datas vêm dos **eventos**, e não da
    /// posição: um relato pode pular etapas, e marcar como percorrido tudo que está
    /// antes contaria uma história que não aconteceu. Projeto sem jornada devolve a
    /// lista vazia, e a página diz isso em vez de prometer.
    ///
    /// **Tudo aqui é montado campo a campo.** Nenhuma entidade é serializada nesta
    /// resposta, e não há herança do que o painel lê. É a única resposta do sistema
    /// que sai para alguém de fora do time do cliente: com serialização, a coluna
    /// acrescentada amanhã a uma tabela interna apareceria aqui sem ninguém decidir,
    /// e vazamento por serialização não dá erro em teste nenhum.
    ///
    /// A resposta sai com `Cache-Control: no-store`. É o relato de alguém, e ele não
    /// fica guardado em proxy nem no disco de quem abriu.
    /// </remarks>
    /// <param name="dto">O protocolo e o token, os dois juntos.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, como quem o escreveu o vê.</response>
    /// <response code="404">O link não abre nenhum relato.</response>
    [HttpPost("tracking")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<PublicReportViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Tracking([FromBody] OpenReportTrackingDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.OpenTrackingAsync(dto, cancellationToken);
            Response.Headers.CacheControl = "no-store";

            return Success(report);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
