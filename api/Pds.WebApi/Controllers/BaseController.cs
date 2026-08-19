using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Shared.Models;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Controlador base: resposta padronizada, acesso a sessao e traducao de excecao
/// de dominio para status HTTP.
/// </summary>
[ApiController]
public abstract class BaseController : ControllerBase
{
    /// <summary>Sessao da requisicao, preenchida pelo middleware.</summary>
    protected IAccountContext Account => HttpContext.RequestServices.GetRequiredService<IAccountContext>();

    protected IActionResult Success<T>(T data, string? message = null, int? total = null)
        => Ok(new ApiResponse<T>(Success: true, Message: message, Data: data, Total: total));

    protected IActionResult Failure(string message, int statusCode)
        => StatusCode(statusCode, new ApiResponse<object>(Success: false, Message: message, Data: null));

    /// <summary>
    /// Traduz a excecao para o status certo.
    ///
    /// Erro nao previsto vira 500 com mensagem generica de proposito: mensagem
    /// interna vazada em resposta conta ao curioso como o sistema e por dentro.
    /// O detalhe vai para o log.
    /// </summary>
    protected IActionResult HandleError(Exception exception)
    {
        if (exception is not (ArgumentException or UnauthorizedAccessException or ForbiddenException
            or KeyNotFoundException or ConflictException))
        {
            var logger = HttpContext.RequestServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger(GetType());
            logger.LogError(exception, "Falha nao tratada em {Path}", HttpContext.Request.Path);
        }

        return exception switch
        {
            ArgumentException => Failure(exception.Message, StatusCodes.Status400BadRequest),
            UnauthorizedAccessException => Failure(exception.Message, StatusCodes.Status401Unauthorized),
            ForbiddenException => Failure(exception.Message, StatusCodes.Status403Forbidden),
            KeyNotFoundException => Failure(exception.Message, StatusCodes.Status404NotFound),
            ConflictException => Failure(exception.Message, StatusCodes.Status409Conflict),
            _ => Failure("Erro ao processar a requisicao.", StatusCodes.Status500InternalServerError)
        };
    }
}
