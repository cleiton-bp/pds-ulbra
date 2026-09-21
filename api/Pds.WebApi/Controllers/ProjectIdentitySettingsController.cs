using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Como quem abre um relato é identificado neste projeto, e quem pode vê-lo.
///
/// **São três formas, e elas são excludentes.** No modo `Protocol` ninguém é
/// identificado, e quem escreveu volta pelo link. Em `PersonalCode` o sistema
/// sorteia um código que a pessoa guarda. `InheritedIdentity` está **adiado**: o
/// modo existe na configuração, nada o lê ainda, e quando voltar a identidade virá
/// assinada pelo sistema do cliente com uma chave assimétrica — nós guardamos só a
/// pública.
///
/// **É esta escolha que decide o que a visibilidade pode ser.** Sem identidade não
/// existe "o meu relato" — logo não existe lista pessoal, e não existe a opção "só
/// os meus" para o projeto escolher. Por isso os dois campos vivem na mesma rota e
/// são gravados juntos: `PublicIdentified` só é aceito onde o modo identifica, e a
/// regra é conferida no par, nunca no campo sozinho.
///
/// **Gravar `PublicAnonymous` ou `PublicIdentified` ainda não publica nada.**
/// Nenhuma rota pública lê a visibilidade hoje. A lista pública nasce atrás da fila
/// de moderação, e o relato só aparece nela depois de liberado — a ordem é de
/// segurança, porque o risco do projeto público não é o nome de quem relatou, e sim
/// o documento colado no meio de um parágrafo.
///
/// **Projeto sem configuração salva não é projeto sem configuração.** Ele usa o
/// padrão, e é isso que esta rota devolve — por isso ela nunca responde 404 para um
/// projeto que existe. Mesmo desenho da configuração da ferramenta e do ciclo.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/identity-settings")]
[Produces("application/json")]
[Tags(SwaggerTags.IdentitySettings)]
public class ProjectIdentitySettingsController : BaseController
{
    private readonly IProjectIdentitySettingsService _identitySettingsService;

    public ProjectIdentitySettingsController(IProjectIdentitySettingsService identitySettingsService)
    {
        _identitySettingsService = identitySettingsService;
    }

    /// <summary>O modo de identificação e a visibilidade deste projeto.</summary>
    /// <remarks>
    /// Quem nunca abriu a tela recebe os **padrões** — `Protocol` e `Private` —, e não uma
    /// resposta vazia: o projeto dele já se comporta desse jeito, e dizer "não
    /// encontrado" sobre algo que está funcionando seria mentira.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O modo e a visibilidade, salvos ou padrão.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IdentitySettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _identitySettingsService.GetAsync(publicId, cancellationToken);
            return Success(settings);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Substitui o modo de identificação e a visibilidade.</summary>
    /// <remarks>
    /// **Trocar de modo não reescreve o passado.** O relato que entrou sob outro
    /// modo continua como entrou, e continua abrindo pelo link — o modo decide o que
    /// acontece daqui para frente. Sem essa garantia, mudar a configuração tornaria
    /// ilegível o que já existia, e quem tinha o link perderia o relato por uma
    /// decisão que não foi dele.
    ///
    /// **Os campos são obrigatórios, e não assumem o padrão quando faltam.** Assumir
    /// faria uma requisição incompleta trocar o modo do projeto sem ninguém ter
    /// escolhido — e um projeto que identificava passaria a não identificar, em
    /// silêncio. Com a visibilidade, o silêncio seria pior: um projeto público
    /// voltaria a privado, ou o contrário, sem ninguém ter pedido.
    ///
    /// **`PublicIdentified` com `Protocol` é recusado**, e nos dois sentidos: tanto
    /// escolher o nível num projeto sem identidade quanto voltar ao protocolo com o
    /// nível já gravado. Sem identidade não há o que mostrar, e o nível seria o
    /// anônimo com outro nome.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">O modo e a visibilidade escolhidos.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Configuração salva.</response>
    /// <response code="400">Campo ausente, desconhecido, ou a combinação que a regra não permite.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpPut]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<IdentitySettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Replace(Guid publicId, [FromBody] IdentitySettingsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _identitySettingsService.ReplaceAsync(publicId, dto, cancellationToken);
            return Success(settings, "Identidade e visibilidade salvas.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
