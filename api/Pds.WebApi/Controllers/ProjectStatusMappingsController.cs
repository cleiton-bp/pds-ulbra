using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// A ponte entre a fila de trabalho e a jornada pública — o que liga um estado de
/// dentro a uma etapa de fora.
///
/// **N para 1, nunca o contrário.** Vários estados internos caem numa mesma etapa
/// pública: "Code Review", "QA" e "Aguardando merge" viram "Em correção". O caminho
/// inverso não existe, porque um estado apontando para duas etapas deixaria sem
/// resposta a única pergunta que isto responde — onde este relato está agora.
///
/// **O mapa se grava inteiro, e cada gravação cria uma versão.** Não há rota para
/// ligar um estado sozinho. Uma versão é um retrato do conjunto completo, e uma
/// rota por ligação criaria uma versão por clique — a linha do tempo de um relato
/// passaria a ser contada por um mapa que existiu por trinta segundos.
///
/// **O passado não se reescreve.** Alterar o mapeamento não toca nas versões
/// anteriores: são elas que explicam por onde um relato de três meses atrás passou.
/// Sem isso, reorganizar a jornada hoje mudaria em silêncio o que já aconteceu — e
/// não haveria como perceber depois, porque o dado necessário para perceber seria
/// justamente o apagado.
///
/// **Estado sem etapa não é erro.** É o caso que importa ver, e a resposta traz a
/// contagem dele à parte: é nele que o relato para de andar do lado de fora.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects/{publicId:guid}/status-mappings")]
[Produces("application/json")]
[Tags(SwaggerTags.ProjectStatusMappings)]
public class ProjectStatusMappingsController : BaseController
{
    private readonly IProjectStatusMappingService _projectStatusMappingService;

    public ProjectStatusMappingsController(IProjectStatusMappingService projectStatusMappingService)
    {
        _projectStatusMappingService = projectStatusMappingService;
    }

    /// <summary>Mostra o mapa que vale agora.</summary>
    /// <remarks>
    /// Traz **todo estado ativo do projeto**, mapeado ou não — a tela precisa mostrar
    /// a pergunta inteira, e não só as respostas dadas. Estado aposentado só aparece
    /// se ainda tiver mapeamento, porque sem ele não há o que configurar.
    ///
    /// `StagePublicId` nulo quer dizer que aquele estado não aponta para lugar
    /// nenhum. `Version` é zero enquanto o cliente nunca ligou nada.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O mapa da versão que vale.</response>
    /// <response code="404">Projeto não existe, ou pertence a outra conta.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<ProjectStatusMappingViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var mapa = await _projectStatusMappingService.GetAsync(publicId, cancellationToken);
            return Success(mapa);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Grava o mapa inteiro, criando uma versão nova.</summary>
    /// <remarks>
    /// **Estado que não vier na lista fica sem mapeamento.** A ausência é a resposta,
    /// e não uma ligação apontando para nada: duas formas de dizer a mesma coisa
    /// acabariam discordando. Lista vazia é um pedido válido — é o cliente desfazendo
    /// tudo.
    ///
    /// **Pedido igual ao que já vale não cria versão.** Um clique em "salvar" sem ter
    /// mudado nada não pode partir a leitura do passado em dois pedaços idênticos.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">As ligações que passam a valer.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O mapa novo, já na versão nova.</response>
    /// <response code="400">O mesmo estado aparece duas vezes.</response>
    /// <response code="404">Projeto, estado ou etapa não existe, ou pertence a outra conta.</response>
    [HttpPut]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectStatusMappingViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Save(Guid publicId, [FromBody] SaveStatusMappingDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var mapa = await _projectStatusMappingService.SaveAsync(publicId, dto, cancellationToken);
            return Success(mapa, "Mapeamento salvo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
