using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Os avisos de quem esta na sessao — o sino do painel — e as preferencias de aviso.
///
/// <para><b>Da pessoa, e nao de um projeto.</b> Mora em <c>/me</c>: o sino junta os
/// avisos de todos os projetos em que ela esta, e some o de um projeto de que ela
/// saiu.</para>
/// </summary>
[Authorize]
[RequireAccount]
[Route("me")]
[Produces("application/json")]
[Tags(SwaggerTags.Notifications)]
public class NotificationsController : BaseController
{
    private readonly INotificationService _notificationService;

    public NotificationsController(INotificationService notificationService)
    {
        _notificationService = notificationService;
    }

    /// <summary>Os avisos, de cinquenta em cinquenta.</summary>
    /// <remarks>
    /// Os avisos da pessoa, dos projetos em que ela está, do mais novo para o mais
    /// antigo: `Mention` (alguém a mencionou num comentário interno, com o começo do
    /// comentário em `Comment`) e `Assignment` (alguém a escolheu como responsável por um
    /// card). `unread=true` traz só os não lidos. A página seguinte vem com `before`, o
    /// identificador do último aviso da página anterior, e `beforeAt`, a hora dele (o
    /// `CreatedAt`): se esse aviso sumiu — o comentário ou o card foi apagado, a menção
    /// saiu numa correção, a pessoa saiu do projeto —, a página segue pela hora, e pode
    /// repetir algum aviso da mesma hora, que o painel tira. `HasMore` diz se há mais
    /// antigos. `UnreadCount` conta todos os não lidos, inclusive os que não vieram.
    /// </remarks>
    /// <param name="unread">Só os não lidos.</param>
    /// <param name="before">Os avisos depois deste — o último da página anterior.</param>
    /// <param name="beforeAt">A hora do aviso de `before`, para seguir mesmo se ele sumiu.</param>
    /// <param name="cancellationToken">Cancelamento da requisição.</param>
    /// <response code="200">Os avisos, se há mais antigos, e quantos não foram lidos.</response>
    /// <response code="404">O aviso de `before` não é desta pessoa, ou não existe mais, e o pedido não trouxe `beforeAt`.</response>
    [HttpGet("notifications")]
    [ProducesResponseType(typeof(ApiResponse<NotificationListViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(
        [FromQuery] bool unread = false,
        [FromQuery] Guid? before = null,
        [FromQuery] DateTimeOffset? beforeAt = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return Success(await _notificationService.ListAsync(unread, before, beforeAt, cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Quantos avisos não foram lidos.</summary>
    /// <remarks>O número do sino — a pergunta barata que o painel repete enquanto está aberto.</remarks>
    /// <response code="200">Quantos não foram lidos.</response>
    [HttpGet("notifications/unread-count")]
    [ProducesResponseType(typeof(ApiResponse<NotificationCountViewModel>), StatusCodes.Status200OK)]
    public async Task<IActionResult> CountUnread(CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _notificationService.CountUnreadAsync(cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Marca um aviso como lido.</summary>
    /// <remarks>Ler de novo não é erro, e não muda a hora da primeira leitura.</remarks>
    /// <response code="200">Quantos ainda não foram lidos.</response>
    /// <response code="404">O aviso não é desta pessoa, ou é de um projeto em que ela não está mais.</response>
    [HttpPost("notifications/{notificationPublicId:guid}/read")]
    [ProducesResponseType(typeof(ApiResponse<NotificationCountViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> MarkRead(Guid notificationPublicId, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _notificationService.MarkReadAsync(notificationPublicId, cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Marca todos os avisos como lidos.</summary>
    /// <remarks>Os dos projetos em que a pessoa está. O de um projeto de que ela saiu fica como estava.</remarks>
    /// <response code="200">Quantos ainda não foram lidos — zero.</response>
    [HttpPost("notifications/read-all")]
    [ProducesResponseType(typeof(ApiResponse<NotificationCountViewModel>), StatusCodes.Status200OK)]
    public async Task<IActionResult> MarkAllRead(CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _notificationService.MarkAllReadAsync(cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>As preferências de aviso: o volume e o som de cada tipo.</summary>
    /// <remarks>
    /// Os avisos ficam no painel — o sino, e o som que a pessoa escolheu para cada tipo
    /// (`Mention`, `Assignment`): `None` é só o sino. `Volume` vai de 0 a 100. Vale em
    /// todos os projetos dela. Os sons são gerados no navegador; aqui fica só o nome. O
    /// tipo que a pessoa nunca escolheu vem com o de fábrica (`Ping` na menção, `Bell`
    /// na escolha como responsável, volume 70).
    /// </remarks>
    /// <response code="200">As preferências.</response>
    [HttpGet("notification-settings")]
    [ProducesResponseType(typeof(ApiResponse<NotificationSettingsViewModel>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSettings(CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _notificationService.GetSettingsAsync(cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Grava as preferências de aviso.</summary>
    /// <remarks>Inteiras: o volume e um som para cada tipo de aviso, todos os tipos, cada um uma vez.</remarks>
    /// <response code="200">As preferências como ficaram.</response>
    /// <response code="400">Sem o volume ou fora de 0 a 100; sem a lista de sons; tipo ou som desconhecido, repetido ou faltando.</response>
    [HttpPut("notification-settings")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<NotificationSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SaveSettings([FromBody] SaveNotificationSettingsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _notificationService.SaveSettingsAsync(dto, cancellationToken), "Preferências salvas.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
