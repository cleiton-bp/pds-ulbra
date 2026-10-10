using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;

namespace Pds.WebApi.Controllers;

/// <summary>
/// O botão parado no site do cliente, lido pelo carregador.
///
/// **É a única rota chamada da página do cliente**, e não de um documento nosso: o
/// carregador desenha o botão e só baixa o quadro no clique. Por isso ela tem uma
/// política de CORS própria — qualquer origem, só `GET`, sem credencial — e devolve só
/// a aparência: nada do formulário, que continua em `GET public/widget-settings`.
///
/// O `[AllowAnonymous]` está escrito, e não subentendido, pelo mesmo motivo das
/// outras rotas públicas: uma política padrão de autorização um dia não pode fechá-la
/// sem ninguém perceber.
/// </summary>
[AllowAnonymous]
[EnableCors(Startup.PublicLauncherCorsPolicy)]
[Route("public/widget-launcher")]
[Produces("application/json")]
[Tags(SwaggerTags.PublicWidgetSettings)]
public class PublicWidgetLauncherController : BaseController
{
    /// <summary>
    /// Quanto o navegador de quem visita guarda a resposta. Cinco minutos: a visita que
    /// passa por várias páginas do site do cliente lê uma vez, e a mudança feita no
    /// painel chega a todo mundo em poucos minutos.
    /// </summary>
    private const string CacheControl = "public, max-age=300";

    private readonly IProjectWidgetSettingsService _widgetSettingsService;

    public PublicWidgetLauncherController(IProjectWidgetSettingsService widgetSettingsService)
    {
        _widgetSettingsService = widgetSettingsService;
    }

    /// <summary>O que o botão precisa para ser desenhado, pela chave pública.</summary>
    /// <remarks>
    /// **As mesmas recusas de `GET public/widget-settings`, na mesma ordem e pela mesma
    /// porta**: chave ausente, desconhecida, revogada ou secreta recebem 401 com a mesma
    /// mensagem; endereço bloqueado no projeto, 403. O endereço fora da lista de
    /// autorizados recebe o botão: o relato dele é recebido e fica retido até o time
    /// decidir. Em qualquer recusa o
    /// carregador não desenha nada — e também não desenha quando a rede falha: um botão
    /// adivinhado poderia aparecer onde o projeto não quer.
    ///
    /// **Projeto arquivado volta com `IsEnabled: false`**, como na configuração inteira.
    ///
    /// **Sai com `Cache-Control: public, max-age=300`.** É a leitura que roda em toda
    /// visita ao site do cliente; a resposta não tem nada de ninguém — é a aparência
    /// pública do botão —, e guardá-la cinco minutos tira a ida à rede das páginas
    /// seguintes. A recusa não é guardada: liberar o endereço no painel vale na próxima
    /// página.
    ///
    /// Lê uma tabela só para a aparência, mais as duas listas de endereço. A
    /// configuração inteira lê quatro, e só é pedida quando alguém abre a ferramenta.
    ///
    /// **O endereço conferido é o do cabeçalho `Origin`, quando ele vem.** Esta rota é
    /// chamada da própria página do cliente, então o navegador carimba nela a origem
    /// verdadeira da página — e a página não consegue mentir sobre ela. O `origin` da
    /// consulta só vale quando o cabeçalho não veio (um pedido de mesma origem, ou de
    /// fora do navegador, onde nenhum dos dois é prova). A resposta sai com
    /// `Vary: Origin`.
    /// </remarks>
    /// <param name="key">Chave pública do projeto, a mesma do `data-key` do script.</param>
    /// <param name="origin">
    /// O endereço da página, como `loja.exemplo.com`, declarado pelo carregador. **Só
    /// vale sem o cabeçalho `Origin`**; com ele, quem diz o endereço é o navegador.
    /// Ausente significa "não declarou".
    /// </param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">A aparência do botão, salva ou padrão.</response>
    /// <response code="401">Chave pública ausente, desconhecida ou revogada.</response>
    /// <response code="403">O endereço está bloqueado no projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<WidgetLauncherViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Get([FromQuery] string? key, [FromQuery] string? origin, CancellationToken cancellationToken)
    {
        try
        {
            // O navegador carimba a origem da pagina neste pedido, e ela vence a que o
            // carregador declarou: uma pagina pode declarar o que quiser na consulta,
            // mas nao o que o navegador diz dela.
            var pagina = HostOfOriginHeader(Request.Headers.Origin.ToString()) ?? origin;

            var launcher = await _widgetSettingsService.GetLauncherByPublicKeyAsync(key, pagina, cancellationToken);
            Response.Headers.CacheControl = CacheControl;
            // A resposta guardada depende tambem de quem pediu: sem isto, um cache no
            // meio do caminho poderia entregar a um endereco bloqueado o que foi lido
            // por outro.
            Response.Headers.Vary = "Origin";

            return Success(launcher);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>
    /// O endereco do cabecalho <c>Origin</c> na forma de <c>location.host</c> — o
    /// dominio e, quando nao e a padrao, a porta —, que e a forma das listas.
    ///
    /// <para>Nulo quando o cabecalho nao veio, ou veio <c>null</c> (pagina de origem
    /// opaca, como um documento em <c>sandbox</c>): ai nao ha origem para conferir, e
    /// vale o que o carregador declarou.</para>
    /// </summary>
    private static string? HostOfOriginHeader(string? header)
    {
        if (string.IsNullOrWhiteSpace(header)
            || !Uri.TryCreate(header.Trim(), UriKind.Absolute, out var uri)
            || uri.Host.Length == 0)
            return null;

        return uri.IsDefaultPort ? uri.Host : $"{uri.Host}:{uri.Port}";
    }
}
