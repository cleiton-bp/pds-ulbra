using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Service.Cards;

/// <summary>
/// Quem esta no time de um projeto agora: quem e dono da conta e quem entrou por
/// convite. E quem pode ser responsavel, e quem pode ser mencionado.
/// </summary>
public static class Team
{
    public static async Task<IReadOnlyList<User>> OfProjectAsync(IUnitOfWork unitOfWork, long accountId, long projectId, CancellationToken cancellationToken)
    {
        var donos = await unitOfWork.Users.ListByAccountAsync(accountId, cancellationToken);
        var membros = await unitOfWork.ProjectMembers.ListByProjectAsync(projectId, cancellationToken);

        return donos.Concat(membros.Select(membro => membro.User)).DistinctBy(pessoa => pessoa.Id).ToList();
    }
}
