using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// O que este projeto aceita receber junto do relato.
///
/// **É esta configuração que diz o que existe.** Desligado o anexo, a ferramenta não
/// mostra nada de mídia e o servidor recusa assinar qualquer permissão de envio —
/// não adianta ter tipo ligado nem limite configurado. É a única trava que a etapa
/// constrói de propósito.
///
/// **Os limites moram numa linha por tipo, e não numa coluna por tipo.** É o desenho
/// que faz acrescentar áudio um dia ser dado, e não migração: com colunas, cada tipo
/// novo custaria uma migração, e toda configuração carregaria campos de tipos que
/// aquele projeto nunca ligou.
///
/// **Sem armazenamento configurado nesta instalação, ligar é recusado.** Ligado sem
/// ele, a ferramenta mostraria o botão e o envio falharia depois de a pessoa já ter
/// escolhido o arquivo. `IsStorageAvailable` na resposta é o que a tela usa para
/// desligar o interruptor e dizer por quê, em vez de deixar tentar.
///
/// **O limite de tamanho não é enfeite.** Ele viaja dentro da assinatura do envio, e
/// quem recusa o que passa é o próprio armazenamento — não há outro lugar onde ele
/// pudesse ser cobrado, porque o arquivo nunca passa pela API.
///
/// **Projeto sem configuração salva não é projeto sem configuração.** Ele usa o
/// padrão, e é isso que esta rota devolve — por isso ela nunca responde 404 para um
/// projeto que existe. Mesmo desenho da configuração da ferramenta e do ciclo.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/media-settings")]
[Produces("application/json")]
[Tags(SwaggerTags.MediaSettings)]
public class ProjectMediaSettingsController : BaseController
{
    private readonly IProjectMediaSettingsService _mediaSettingsService;

    public ProjectMediaSettingsController(IProjectMediaSettingsService mediaSettingsService)
    {
        _mediaSettingsService = mediaSettingsService;
    }

    /// <summary>O que este projeto aceita receber junto do relato.</summary>
    /// <remarks>
    /// Quem nunca abriu a tela recebe os **padrões**, e não uma resposta vazia: o
    /// projeto dele já se comporta desse jeito, e dizer "não encontrado" sobre algo
    /// que está funcionando seria mentira.
    ///
    /// **Todo tipo conhecido aparece na lista**, mesmo o que nunca foi salvo — com o
    /// padrão de fábrica. Assim um tipo novo do produto passa a existir para todo
    /// projeto no dia em que entra, sem depender de alguém abrir a tela e salvar.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">A configuração, salva ou padrão.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<MediaSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _mediaSettingsService.GetAsync(publicId, cancellationToken);
            return Success(settings);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Substitui a configuração de mídia inteira.</summary>
    /// <remarks>
    /// **Vai inteira, e não em pedaços.** Salvar campo a campo faria duas abas
    /// abertas gravarem metades diferentes da mesma configuração sem ninguém notar —
    /// e o limite total e o de cada tipo só fazem sentido lidos juntos.
    ///
    /// **Os campos são obrigatórios, e não assumem o padrão quando faltam.** Aqui um
    /// número assumido é dinheiro gasto sem ninguém ter decidido: cada limite destes
    /// é o que o projeto vai guardar, e guardar custa.
    ///
    /// **Há um teto do sistema acima do que o projeto escolhe.** O limite do projeto
    /// protege a conta de quem configurou; o teto protege a nossa de quem configurou
    /// errado.
    ///
    /// **Anexo ligado sem nenhum tipo aceito é recusado**, porque não aceitaria nada
    /// — quem quer isso já tem o caminho certo, que é desligar o anexo. E **tipo que
    /// a requisição não mandar fica como está**, para uma versão antiga da tela não
    /// apagar a configuração de um tipo que ela não conhece.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">A configuração inteira, com os limites de cada tipo.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Configuração salva.</response>
    /// <response code="400">Campo ausente, limite fora do teto, tipo repetido, ou anexo ligado sem armazenamento.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpPut]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<MediaSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Replace(Guid publicId, [FromBody] MediaSettingsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _mediaSettingsService.ReplaceAsync(publicId, dto, cancellationToken);
            return Success(settings, "Configuração de mídia salva.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
