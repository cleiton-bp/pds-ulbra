using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;

namespace Pds.WebApi.Controllers;

/// <summary>
/// A configuração da ferramenta, lida pela própria ferramenta.
///
/// **É a segunda rota do sistema que funciona sem sessão**, e pelo mesmo motivo da
/// primeira: quem chama é o quadro aberto no site de um cliente, e a única coisa
/// que a requisição carrega é a chave pública.
///
/// Por isso o `[AllowAnonymous]` está escrito, e não subentendido pela ausência do
/// `[Authorize]`: no dia em que alguém definir uma política padrão de autorização
/// para a API inteira, esta rota precisa continuar aberta de propósito.
/// </summary>
[AllowAnonymous]
[Route("public/widget-settings")]
[Produces("application/json")]
[Tags(SwaggerTags.PublicWidgetSettings)]
public class PublicWidgetSettingsController : BaseController
{
    private readonly IProjectWidgetSettingsService _widgetSettingsService;

    public PublicWidgetSettingsController(IProjectWidgetSettingsService widgetSettingsService)
    {
        _widgetSettingsService = widgetSettingsService;
    }

    /// <summary>A configuração da ferramenta de um projeto, pela chave pública.</summary>
    /// <remarks>
    /// **Por que a chave vem na URL aqui, se o relato a manda no corpo.** A que o
    /// carregador evita pôr em URL é a que ficaria no `src` do quadro — dentro do
    /// documento **do cliente**, no histórico do navegador de quem visita e no
    /// `Referer` que sai de lá. Esta chamada é outra coisa: ela sai do nosso próprio
    /// documento para a nossa própria API, e a URL não aparece na página de
    /// ninguém. Em troca, a resposta passa a ser cacheável — o que um `POST` não
    /// seria, e é o que evita uma ida à rede em toda visita ao site do cliente.
    ///
    /// Chave ausente, desconhecida, revogada ou secreta recebem **a mesma** recusa,
    /// com a mesma mensagem: responder "esta chave existe mas foi revogada"
    /// contaria a quem tenta que ele acertou metade.
    ///
    /// **Projeto arquivado volta com `IsEnabled: false`**, qualquer que seja o valor
    /// salvo. Ele recusa relato novo com 403, e deixar o formulário abrir levaria a
    /// pessoa a escrever até o fim para ser recusada no envio.
    ///
    /// **`AcceptsQuestionsDefault` vem de outra tabela**, e isso é deliberado: o
    /// valor mora nas regras do ciclo, porque é lá que a resposta significa alguma
    /// coisa — e quem precisa dele para *desenhar* é a ferramenta. Esta resposta é
    /// "tudo que o quadro precisa para aparecer", e não "o conteúdo da tabela de
    /// configuração do quadro".
    ///
    /// **Endereço fora da lista do projeto recebe 403, e não uma configuração
    /// desligada.** A ferramenta está ligada, só não naquela página — e o quadro
    /// trata as duas recusas do mesmo jeito, não desenhando nada. Projeto com a
    /// lista vazia aceita qualquer endereço, e quem não declara endereço passa.
    /// </remarks>
    /// <param name="key">Chave pública do projeto, a mesma do `data-key` do script.</param>
    /// <param name="origin">
    /// O endereço da página que abriu o quadro, como `loja.exemplo.com`. Declarado
    /// pela própria página: o quadro roda no nosso domínio, então o endereço que o
    /// navegador carimba nesta chamada é o nosso. Ausente significa "não declarou",
    /// e não "veio de lugar nenhum".
    /// </param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">A configuração, salva ou padrão.</response>
    /// <response code="401">Chave pública ausente, desconhecida ou revogada.</response>
    /// <response code="403">O endereço declarado não está na lista do projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<WidgetSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Get([FromQuery] string? key, [FromQuery] string? origin, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _widgetSettingsService.GetByPublicKeyAsync(key, origin, cancellationToken);
            return Success(settings);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
