using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;

namespace Pds.WebApi.Controllers;

/// <summary>
/// O que a ferramenta precisa saber sobre anexo, antes de desenhar qualquer coisa.
///
/// **Sem sessão, como a leitura da própria ferramenta.** Quem chama é o quadro
/// dentro do site do cliente, e ali não há conta nenhuma logada — a credencial é a
/// chave pública, e ela só diz de que projeto é o quadro.
///
/// **Só os tipos ligados aparecem.** A ferramenta não tem o que fazer com um tipo
/// que o projeto recusa, e listar o que não serve daria a quem inspeciona um mapa
/// do que existe do outro lado.
///
/// **Sem armazenamento nesta instalação, vem desligado** — mesmo que o projeto
/// tenha o anexo ligado na configuração dele. O botão existir e o envio falhar
/// seria pior do que o botão não existir, e a configuração gravada continua intacta
/// para o dia em que houver armazenamento.
///
/// **Vem separado da configuração da ferramenta de propósito.** São duas perguntas
/// diferentes — como o quadro se parece, e o que ele aceita receber —, e juntá-las
/// faria mudar uma mexer no contrato da outra.
/// </summary>
[Route("public/media-settings")]
[Produces("application/json")]
[Tags(SwaggerTags.PublicMediaSettings)]
public class PublicMediaSettingsController : BaseController
{
    private readonly IProjectMediaSettingsService _mediaSettingsService;

    public PublicMediaSettingsController(IProjectMediaSettingsService mediaSettingsService)
    {
        _mediaSettingsService = mediaSettingsService;
    }

    /// <summary>O que este projeto aceita receber junto do relato.</summary>
    /// <remarks>
    /// Projeto que nunca abriu a tela de Mídia responde com os **padrões**, e não
    /// com uma resposta vazia: ele já se comporta desse jeito.
    ///
    /// **Os tipos de arquivo vêm junto de cada categoria** — é o que permite o
    /// seletor do navegador já filtrar o que não serve. Recusar depois de a pessoa
    /// escolher é recusar tarde.
    /// </remarks>
    /// <param name="key">A chave pública do projeto.</param>
    /// <param name="origin">O endereço da página que hospeda a ferramenta.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O que a ferramenta pode oferecer.</response>
    /// <response code="401">Chave pública ausente, desconhecida ou revogada.</response>
    /// <response code="403">O endereço declarado não está na lista do projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PublicMediaSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Get(
        [FromQuery] string? key,
        [FromQuery] string? origin,
        CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _mediaSettingsService.GetByPublicKeyAsync(key, origin, cancellationToken);
            return Success(settings);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
