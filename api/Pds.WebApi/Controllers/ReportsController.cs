using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Os relatos que chegaram a um projeto, para o time que usa o painel.
///
/// **É o outro lado do `/public/reports`.** Lá o relato entra sem que ninguém
/// esteja identificado, porque quem escreve é um visitante anônimo do site do
/// cliente; aqui ele só sai para quem é dono dele. São as duas pontas da mesma
/// tabela, com exigências opostas de propósito.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/reports")]
[Produces("application/json")]
[Tags(SwaggerTags.Reports)]
public class ReportsController : BaseController
{
    private readonly IReportService _reportService;

    public ReportsController(IReportService reportService)
    {
        _reportService = reportService;
    }

    /// <summary>Lista os relatos do projeto, do mais novo para o mais antigo.</summary>
    /// <remarks>
    /// **O texto vem inteiro.** Cortar aqui exigiria uma segunda rota só para ler o
    /// resto, e enquanto ela não existisse o time leria pela metade o que a pessoa
    /// escreveu. Quem limita o tamanho da resposta é a página; quem corta para
    /// caber na linha é a tela.
    ///
    /// O `Total` do envelope é o número de relatos do projeto, e não o desta
    /// página: é ele que diz se ainda há o que carregar.
    ///
    /// Página e tamanho fora da faixa são **corrigidos**, não recusados — pedir a
    /// página zero é engano de quem chama, e não motivo para a tela ficar sem
    /// lista. O tamanho máximo é 100.
    ///
    /// Lista vazia não é erro: é um projeto que ainda não recebeu nada.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="page">Página, começando em 1.</param>
    /// <param name="pageSize">Quantos relatos por página. Padrão 20, máximo 100.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Relatos do projeto.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ReportSummaryViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(
        Guid publicId,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        try
        {
            var reports = await _reportService.ListAsync(publicId, page, pageSize, cancellationToken);
            return Success(reports.Items, total: reports.Total);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Abre um relato, com o contexto que veio junto.</summary>
    /// <remarks>
    /// **Esta consulta grava.** Abrir um relato registra um evento de visualização
    /// com origem no painel, e o intervalo entre ele e a criação é o tempo que o
    /// time levou para ir olhar — metade da pergunta que este trabalho investiga.
    ///
    /// Por isso ela **não deve ser chamada para adiantar dado que ninguém pediu**:
    /// cada chamada vira uma linha, e uma lista que abrisse os relatos sozinha
    /// inventaria leituras que não aconteceram.
    ///
    /// O contexto sai em ordem de chave. Ele vem do navegador de quem relatou, e
    /// não de quem digitou: serve para reproduzir o problema, nunca para
    /// identificar a pessoa.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, com o contexto. A visualização foi registrada.</response>
    /// <response code="404">Relato ou projeto não existe, ou pertence a outra conta.</response>
    [HttpGet("{reportPublicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, Guid reportPublicId, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.GetAsync(publicId, reportPublicId, cancellationToken);
            return Success(report);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
