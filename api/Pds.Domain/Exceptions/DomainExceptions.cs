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
