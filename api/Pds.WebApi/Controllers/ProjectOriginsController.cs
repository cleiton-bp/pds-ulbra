using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Endereços autorizados a mandar relatos direto para o Trabalho de um projeto.
///
/// A chave pública fica visível no HTML do site do cliente e qualquer visitante
/// consegue lê-la. Sozinha, ela diz apenas qual projeto procurar — não de onde o
/// relato saiu. É esta lista que responde a segunda pergunta.
///
/// **O relato de um endereço fora da lista é recebido, e retido.** Quem relatou tem
/// protocolo e acompanhamento como sempre; o time não vê o relato até decidir, em
/// "Aguardando liberação" (`pending`): **permitir** o endereço (entrar nesta lista) faz
/// os retidos dele entrarem no topo do quadro, e **bloquear** os apaga de vez. A lista
/// vazia não autoriza ninguém — todo endereço novo passa por essa pergunta uma vez, e
/// quem administra é avisado no sino. O endereço do próprio painel nunca é retido.
///
/// **E ela é grade de proteção, não muro.** A ferramenta abre num quadro servido
/// pelo nosso domínio, então a origem que o navegador carimba é a nossa, e a que a
/// página hospedeira informa é auto-declarada. Como quem informa é o carregador,
/// que é código nosso, a chave copiada para outro site é pega; quem falar direto
/// com a API declara o que quiser. O muro é o `frame-ancestors` montado a partir
/// desta lista, que precisa de um servidor servindo o documento do quadro para
/// montar o cabeçalho por projeto — **Planejado**, para quando houver domínio próprio.
///
/// **Ao lado dela, a lista de bloqueados** (`blocked`) e os endereços que já mandaram
/// relatos (`observed`). O bloqueado é recusado nas rotas que a ferramenta usa ao abrir
/// e ao enviar, na hora: é a reação a um endereço que apareceu e não é do cliente. As
/// duas listas nunca dizem o contrário uma da outra sobre o mesmo endereço — bloquear
/// tira da lista de autorizados, e autorizar tira da de bloqueados.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/origins")]
[Produces("application/json")]
[Tags(SwaggerTags.ProjectOrigins)]
public class ProjectOriginsController : BaseController
{
    private readonly IProjectOriginService _projectOriginService;

    public ProjectOriginsController(IProjectOriginService projectOriginService)
    {
        _projectOriginService = projectOriginService;
    }

    /// <summary>Lista os endereços autorizados do projeto.</summary>
    /// <remarks>
    /// Em ordem alfabética: a lista é consultada para conferir se um endereço está
    /// nela, e procurar é mais fácil do que lembrar quando cada um entrou.
    ///
    /// **Lista vazia não autoriza ninguém**: o relato de qualquer endereço fica retido
    /// até o time permitir o endereço. A ferramenta continua abrindo — é o primeiro
    /// relato que faz o endereço aparecer em "Aguardando liberação".
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Endereços autorizados.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectOriginViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var origins = await _projectOriginService.ListAsync(publicId, cancellationToken);
            return Success(origins, total: origins.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Autoriza um endereço.</summary>
    /// <remarks>
    /// O domínio pode vir colado da barra do navegador: o esquema, o caminho e a
    /// barra final são descartados, e o que sobra é guardado em minúsculo. A porta,
    /// quando informada, faz parte — para o navegador, `site.com` e `site.com:3000`
    /// são endereços diferentes.
    ///
    /// Curinga não é aceito: em vez de `*.site.com`, informe `site.com` e ligue
    /// `AllowsSubdomains`.
    ///
    /// **Os relatos retidos que o endereço passa a cobrir entram no Trabalho**, no topo
    /// do quadro, como relatos novos.
    ///
    /// Autorizar o domínio bloqueado desbloqueia ele. O coberto pelo bloqueio de
    /// **outra** linha com subdomínios — `app.loja.com` com `*.loja.com` bloqueado — é
    /// recusado: o bloqueio venceria, e desfazê-lo em silêncio abriria os outros
    /// subdomínios. A mensagem diz qual desbloquear.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Domínio a autorizar.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Endereço autorizado.</response>
    /// <response code="400">Domínio em branco ou fora do formato.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Endereço já autorizado, coberto pelo bloqueio de outro domínio com subdomínios, ou limite do projeto atingido.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectOriginViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(Guid publicId, [FromBody] CreateProjectOriginDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var origin = await _projectOriginService.CreateAsync(publicId, dto, cancellationToken);
            return Success(origin, "Domínio autorizado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Retira a autorização de um endereço.</summary>
    /// <remarks>
    /// A ferramenta para de abrir naquele endereço a partir da próxima carga da
    /// página. Os relatos que já chegaram de lá continuam onde estão.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="originPublicId">Identificador público do endereço.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Autorização retirada.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto ou endereço não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpDelete("{originPublicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid publicId, Guid originPublicId, CancellationToken cancellationToken)
    {
        try
        {
            await _projectOriginService.DeleteAsync(publicId, originPublicId, cancellationToken);
            return Success<object?>(null, "Domínio removido.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Lista os endereços que já mandaram relatos ao projeto.</summary>
    /// <remarks>
    /// Contados pelo endereço gravado em cada relato (os arquivados inclusive): quantos,
    /// quando chegou o último e como o projeto trata o endereço hoje — `Allowed` (uma
    /// linha da lista de autorizados vale para ele), `Blocked` (uma da de bloqueados
    /// vale, e ele é recusado mesmo autorizado) ou `Unlisted`. Com o endereço bloqueado,
    /// `MarkedCount` diz quantos relatos dele estão marcados com a origem bloqueada, e
    /// `BlockedOriginId` é a linha de bloqueio que vale para ele.
    ///
    /// Do mais recente para o mais antigo, **até cem**. O card do time não tem
    /// endereço, e não conta.
    ///
    /// O endereço é o que a página declarou: indício, e não prova — quem fala direto
    /// com a API declara o que quiser.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Os endereços que mandaram relatos.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet("observed")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ObservedOriginViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ListObserved(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var origins = await _projectOriginService.ListObservedAsync(publicId, cancellationToken);
            return Success(origins, total: origins.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Lista os endereços bloqueados.</summary>
    /// <remarks>
    /// Do mais novo para o mais antigo, com quem bloqueou e quantos relatos de cada um
    /// estão marcados com a origem bloqueada (`MarkedCount`) — os que o time ainda não
    /// decidiu manter nem apagar.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Endereços bloqueados.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet("blocked")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectBlockedOriginViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ListBlocked(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var blocked = await _projectOriginService.ListBlockedAsync(publicId, cancellationToken);
            return Success(blocked, total: blocked.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Bloqueia um endereço.</summary>
    /// <remarks>
    /// **Vale na hora**: as listas são lidas do banco a cada pedido, então o próximo
    /// relato daquele endereço já é recusado (403), e a ferramenta deixa de abrir lá —
    /// mesmo com a lista de autorizados vazia. O botão desenhado pelo carregador pode
    /// continuar à vista até cinco minutos, o tempo que o navegador guarda a aparência;
    /// abrir e enviar já são recusados.
    ///
    /// O domínio é normalizado como na lista de autorizados, e a porta faz parte.
    /// `IncludesSubdomains` (ou `*.` na frente) barra também o que estiver abaixo dele;
    /// sem isso, só o endereço exato.
    ///
    /// **O mesmo endereço sai da lista de autorizados**, se estava nela. Os relatos que
    /// já vieram dele e foram aceitos ficam marcados com a origem bloqueada, para o time
    /// decidir em lote (`POST reports/blocked-origin/keep` ou `/delete`). **Os retidos
    /// dele são apagados de vez**, na mesma hora: nunca foram aceitos.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Domínio a bloquear.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Endereço bloqueado, com quantos relatos dele ficaram marcados.</response>
    /// <response code="400">Domínio em branco ou fora do formato.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Endereço já bloqueado, ou limite de cem do projeto atingido.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost("blocked")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectBlockedOriginViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Block(Guid publicId, [FromBody] CreateProjectBlockedOriginDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var blocked = await _projectOriginService.BlockAsync(publicId, dto, cancellationToken);
            return Success(blocked, "Domínio bloqueado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Desbloqueia um endereço.</summary>
    /// <remarks>
    /// Vale na hora. Os relatos que vieram dele deixam de estar marcados com a origem
    /// bloqueada. Fora da lista de autorizados, o próximo relato dele fica retido.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="blockedPublicId">Identificador público do bloqueio.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Endereço desbloqueado.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto ou bloqueio não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpDelete("blocked/{blockedPublicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Unblock(Guid publicId, Guid blockedPublicId, CancellationToken cancellationToken)
    {
        try
        {
            await _projectOriginService.UnblockAsync(publicId, blockedPublicId, cancellationToken);
            return Success<object?>(null, "Domínio desbloqueado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Lista os endereços com relatos retidos ("Aguardando liberação").</summary>
    /// <remarks>
    /// Os relatos que chegaram de um endereço fora da lista de autorizados — ou sem dizer
    /// de onde vieram (`Domain` nulo) — e que o time ainda não viu: quantos de cada um e
    /// quando chegou o mais novo, do mais recente para o mais antigo. Para cada endereço,
    /// **Permitir** é `POST origins` e **Bloquear** é `POST origins/blocked`; para os sem
    /// endereço, `pending/release` e `pending/delete`.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Os endereços com relatos retidos.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet("pending")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<HeldOriginViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ListPending(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var pending = await _projectOriginService.ListPendingAsync(publicId, cancellationToken);
            return Success(pending, total: pending.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Libera os relatos retidos de um endereço, sem mexer nas listas.</summary>
    /// <remarks>
    /// Os retidos do endereço exato (`Domain`), ou os que não disseram de onde vieram
    /// (`Domain` nulo), entram no Trabalho, no topo do quadro. **O endereço não entra na
    /// lista de autorizados**: o próximo relato dele fica retido de novo — para isso há o
    /// `POST origins`.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">O endereço, ou nulo.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Quantos relatos foram liberados.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost("pending/release")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<HeldOriginReportsResultViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ReleasePending(Guid publicId, [FromBody] HeldOriginReportsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _projectOriginService.ReleasePendingAsync(publicId, dto, cancellationToken);
            return Success(result, "Relatos liberados.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Apaga de vez os relatos retidos de um endereço, sem mexer nas listas.</summary>
    /// <remarks>
    /// Os retidos do endereço exato (`Domain`), ou os que não disseram de onde vieram
    /// (`Domain` nulo), saem de vez, com os anexos — como na exclusão dos cards de um
    /// endereço bloqueado. **Não há como desfazer.** Quem relatou passa a receber 404 no
    /// acompanhamento.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">O endereço, ou nulo.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Quantos relatos foram apagados.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPost("pending/delete")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<HeldOriginReportsResultViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeletePending(Guid publicId, [FromBody] HeldOriginReportsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _projectOriginService.DeletePendingAsync(publicId, dto, cancellationToken);
            return Success(result, "Relatos apagados.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
