namespace Pds.Domain.Exceptions;

/// <summary>Regra de negocio negou o acesso. Vira HTTP 403.</summary>
public class ForbiddenException : Exception
{
    public ForbiddenException(string message) : base(message)
    {
    }
}

/// <summary>Conflito de estado, por exemplo nome de projeto ja usado na conta. Vira HTTP 409.</summary>
public class ConflictException : Exception
{
    public ConflictException(string message) : base(message)
    {
    }
}

/// <summary>
/// Pedidos demais em pouco tempo. Vira HTTP 429, com o cabecalho <c>Retry-After</c> e,
/// quando ha, o que fazer em <see cref="Payload"/> — o desafio a resolver, ou ate
/// quando esperar. Sem o corpo, quem chama receberia so o numero.
/// </summary>
public class TooManyRequestsException : Exception
{
    public TooManyRequestsException(string message, int retryAfterSeconds, object? payload = null) : base(message)
    {
        RetryAfterSeconds = retryAfterSeconds;
        Payload = payload;
    }

    /// <summary>Em quantos segundos vale tentar de novo.</summary>
    public int RetryAfterSeconds { get; }

    /// <summary>O que vai em <c>Data</c> na resposta.</summary>
    public object? Payload { get; }
}
