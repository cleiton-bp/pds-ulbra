using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

public interface IProjectMemberRepository : IBaseRepository<ProjectMember>
{
    /// <summary>Quem esta no time do projeto, com a pessoa de cada linha.</summary>
    Task<IReadOnlyList<ProjectMember>> ListByProjectAsync(long projectId, CancellationToken cancellationToken = default);

    /// <summary>A linha de uma pessoa no projeto, para mudar o papel ou tirar do time.</summary>
    Task<ProjectMember?> GetByProjectAndUserAsync(long projectId, long userId, CancellationToken cancellationToken = default);

    /// <summary>Se alguem do time do projeto tem este e-mail — convidar quem ja esta e recusado.</summary>
    Task<bool> ExistsByEmailAsync(long projectId, string email, CancellationToken cancellationToken = default);

    /// <summary>
    /// Se a pessoa ja esta no time, <b>sem sessao do projeto</b>: quem aceita um
    /// convite ainda nao enxerga o projeto, e o filtro esconderia a propria linha.
    /// </summary>
    Task<bool> ExistsWithoutSessionAsync(long projectId, long userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Quem administra o projeto: as pessoas da conta dona (que administram todos os
    /// projetos dela) e quem esta no time como administrador. <b>Sem sessao</b>: quem
    /// pergunta e a entrada do relato, para avisar o time no sino.
    /// </summary>
    Task<IReadOnlyList<User>> ListAdministratorsWithoutSessionAsync(long projectId, long accountId, CancellationToken cancellationToken = default);
}
