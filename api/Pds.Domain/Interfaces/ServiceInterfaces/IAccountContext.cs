using Pds.Domain.Security;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// Quem esta fazendo a requisicao, e o que essa pessoa enxerga.
///
/// E a <b>unica</b> fonte do acesso usado nas consultas. Nunca o corpo da
/// requisicao, nunca a rota: se o cliente pudesse informar a conta ou o papel, o
/// isolamento viraria sugestao. O middleware preenche isto a partir do token ja
/// validado e do banco.
/// </summary>
public interface IAccountContext
{
    /// <summary>
    /// Chave interna da conta propria da pessoa — a que nasceu no primeiro acesso.
    /// Serve para criar projeto e conferir nome repetido; quem decide o que a pessoa
    /// enxerga sao os <see cref="Projects"/>.
    /// </summary>
    long? AccountId { get; }

    /// <summary>Identificador publico da conta propria, para respostas.</summary>
    Guid? AccountPublicId { get; }

    /// <summary>Chave interna do usuario.</summary>
    long? UserId { get; }

    /// <summary>Identificador publico do usuario, para respostas.</summary>
    Guid? UserPublicId { get; }

    /// <summary>Ha usuario autenticado e conta resolvida nesta requisicao.</summary>
    bool IsAuthenticated { get; }

    /// <summary>
    /// Os projetos que a pessoa enxerga: todos os da conta propria, como dona, e os
    /// de outras contas em que entrou pelo time, com o papel de cada um.
    /// </summary>
    IReadOnlyList<ProjectAccess> Projects { get; }

    /// <summary>
    /// As chaves internas dos <see cref="Projects"/>. E o que alimenta o filtro
    /// global do contexto. Vazio sem sessao — e vazio nao enxerga nada.
    /// </summary>
    IReadOnlyList<long> ProjectIds { get; }

    /// <summary>O acesso a um projeto pelo identificador publico; nulo se a pessoa nao o enxerga.</summary>
    ProjectAccess? FindProject(Guid projectPublicId);

    /// <summary>O acesso a um projeto pela chave interna; nulo se a pessoa nao o enxerga.</summary>
    ProjectAccess? FindProject(long projectId);
}
