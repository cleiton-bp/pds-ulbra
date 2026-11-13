using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>Usuário e conta da sessão atual.</summary>
[Authorize]
[RequireAccount]
[Route("me")]
[Produces("application/json")]
[Tags(SwaggerTags.Session)]
public class MeController : BaseController
{
    private readonly IAuthService _authService;
    private readonly IAccountDeletionService _accountDeletion;

    public MeController(IAuthService authService, IAccountDeletionService accountDeletion)
    {
        _authService = authService;
        _accountDeletion = accountDeletion;
    }

    /// <summary>Quem está logado e em qual conta.</summary>
    /// <remarks>
    /// É a primeira chamada do painel ao abrir: serve para saber se a sessão
    /// guardada no navegador ainda vale e para preencher o cabeçalho com o nome e a
    /// foto.
    ///
    /// A conta vem sempre da sessão. Não há parâmetro para consultar outra.
    /// </remarks>
    /// <response code="200">Usuário e conta da sessão.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<MeViewModel>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _authService.GetCurrentAsync(cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>O que a exclusão da conta leva, para o diálogo de confirmação.</summary>
    /// <remarks>
    /// Conta, no banco, os projetos da conta, os relatos e cards deles, as pessoas de
    /// outras contas que trabalham nesses projetos (e perdem o acesso) e os projetos de
    /// outras contas em que a pessoa está no time. Devolve também o prazo para desistir.
    /// </remarks>
    /// <response code="200">O que vai sumir, e o prazo.</response>
    [HttpGet("deletion")]
    [ProducesResponseType(typeof(ApiResponse<AccountDeletionPreviewViewModel>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDeletionPreview(CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _accountDeletion.GetPreviewAsync(cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Pede a exclusão da conta, com 24 horas para desistir.</summary>
    /// <remarks>
    /// **Tudo sai do ar na hora**: o painel fecha para a pessoa e para o time, o botão some
    /// dos sites e o acompanhamento deixa de abrir. As sessões da pessoa são encerradas em
    /// todos os aparelhos.
    ///
    /// **Desfazer é entrar de novo** com o mesmo Google antes de `PurgeAt`: os projetos
    /// voltam como estavam. Passado o prazo, a conta, os projetos, os relatos e os arquivos
    /// são apagados de vez, e da pessoa sai o que a identifica.
    ///
    /// A confirmação é o diálogo do painel, que explica tudo isso antes do botão.
    /// </remarks>
    /// <response code="200">Exclusão pedida. Devolve quando ela vira definitiva.</response>
    /// <response code="409">A exclusão já tinha sido pedida.</response>
    [HttpPost("deletion")]
    [ProducesResponseType(typeof(ApiResponse<AccountDeletionRequestedViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RequestDeletion(CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _accountDeletion.RequestAsync(cancellationToken), "Exclusão da conta pedida.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
