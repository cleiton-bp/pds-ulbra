namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// Quem esta fazendo a requisicao e de qual conta.
///
/// E a <b>unica</b> fonte da conta usada nas consultas. Nunca o corpo da
/// requisicao, nunca a rota: se o cliente pudesse informar a conta, o isolamento
/// viraria sugestao. O middleware preenche isto a partir do token ja validado.
/// </summary>
public interface IAccountContext
{
    /// <summary>Chave interna da conta. E o que alimenta o filtro global do contexto.</summary>
    long? AccountId { get; }

    /// <summary>Identificador publico da conta, para respostas.</summary>
    Guid? AccountPublicId { get; }

    /// <summary>Chave interna do usuario.</summary>
    long? UserId { get; }

    /// <summary>Identificador publico do usuario, para respostas.</summary>
    Guid? UserPublicId { get; }

    /// <summary>Ha usuario autenticado e conta resolvida nesta requisicao.</summary>
    bool IsAuthenticated { get; }
}
