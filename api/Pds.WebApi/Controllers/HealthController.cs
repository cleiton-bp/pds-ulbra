using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Data.Context;
using Pds.WebApi.Health;

namespace Pds.WebApi.Controllers;

/// <summary>
/// As sondas de saude, para quem hospeda a API — o Kubernetes, ou qualquer plataforma que
/// pergunte se ela esta de pe. Sem sessao: quem pergunta e a plataforma, a cada poucos
/// segundos. Fora do Swagger, que descreve a API do produto.
/// </summary>
[AllowAnonymous]
[Route("health")]
[ApiExplorerSettings(IgnoreApi = true)]
public class HealthController : BaseController
{
    private readonly WarmUp _aquecimento;

    public HealthController(WarmUp aquecimento)
    {
        _aquecimento = aquecimento;
    }

    /// <summary>
    /// **Vida**: o processo responde. Nunca olha o banco: com o banco fora, reiniciar a API
    /// nao o traz de volta — so derrubaria quem ainda esta sendo atendido.
    /// </summary>
    [HttpGet("live")]
    public IActionResult Live() => Success("viva");

    /// <summary>
    /// **Prontidao**: aquecida (ver <see cref="WarmUp"/>) e com o banco ao alcance. Ate la,
    /// 503 — e a plataforma nao manda pedido para ca. E o que faz o deploy sem parar nao
    /// entregar a ninguem a API ainda fria.
    /// </summary>
    [HttpGet("ready")]
    public async Task<IActionResult> Ready([FromServices] DataContext banco, CancellationToken cancellationToken)
    {
        if (!_aquecimento.Done)
            return Failure("Aquecendo.", StatusCodes.Status503ServiceUnavailable);

        return await banco.Database.CanConnectAsync(cancellationToken)
            ? Success("pronta")
            : Failure("O banco nao responde.", StatusCodes.Status503ServiceUnavailable);
    }
}
