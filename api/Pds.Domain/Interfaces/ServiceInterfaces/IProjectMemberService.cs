using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>Quem esta no time de um projeto, e o que o administrador faz com isso.</summary>
public interface IProjectMemberService
{
    /// <summary>O time: o dono primeiro, depois quem entrou, na ordem em que entrou.</summary>
    Task<IReadOnlyList<TeamMemberViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>Muda o papel de alguem do time. O dono nao muda.</summary>
    Task<TeamMemberViewModel> ChangeRoleAsync(Guid projectPublicId, Guid userPublicId, ChangeMemberRoleDto dto, CancellationToken cancellationToken = default);

    /// <summary>Tira alguem do time; o acesso acaba na requisicao seguinte. O dono nao sai.</summary>
    Task RemoveAsync(Guid projectPublicId, Guid userPublicId, CancellationToken cancellationToken = default);
}
