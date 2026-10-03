using System.Text.Json;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;

namespace Pds.Service.Services;

/// <summary>
/// O time de um projeto: quem esta, com que papel, e o que o administrador muda.
///
/// <para><b>O dono nao tem linha em project_members</b>, e por isso nao sai nem muda
/// de papel: ele manda em todos os projetos da conta propria. Aparece na lista como
/// administrador, marcado como dono, para o time saber quem e.</para>
///
/// <para><b>Tirar do time apaga a linha, e nunca a pessoa</b> — o que ela escreveu
/// nos relatos continua com o nome dela. O acesso acaba na requisicao seguinte: a
/// lista de projetos de cada pedido e montada de novo, a partir desta tabela.</para>
/// </summary>
public class ProjectMemberService : IProjectMemberService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAccountContext _accountContext;

    public ProjectMemberService(IUnitOfWork unitOfWork, IAccountContext accountContext)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
    }

    public async Task<IReadOnlyList<TeamMemberViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var donos = await _unitOfWork.Users.ListByAccountAsync(project.AccountId, cancellationToken);
        var membros = await _unitOfWork.ProjectMembers.ListByProjectAsync(project.Id, cancellationToken);
        var eu = _accountContext.UserId;

        var idsDosDonos = donos.Select(dono => dono.Id).ToHashSet();

        return donos
            .Select(dono => new TeamMemberViewModel(
                dono.PublicId, dono.Name, dono.Email, dono.AvatarUrl,
                ProjectRoleEnum.Administrator, IsAccountOwner: true, IsYou: dono.Id == eu, JoinedAt: null))
            // A linha de quem tambem e dono e ignorada: o dono ja manda por ser
            // dono, e aparecer duas vezes faria parecer que tem dois papeis.
            .Concat(membros
                .Where(membro => !idsDosDonos.Contains(membro.UserId))
                .Select(membro => Map(membro, eu)))
            .ToList();
    }

    public async Task<TeamMemberViewModel> ChangeRoleAsync(Guid projectPublicId, Guid userPublicId, ChangeMemberRoleDto dto, CancellationToken cancellationToken = default)
    {
        var papel = dto.Role ?? throw new ArgumentException("Informe o papel.");

        // O numero que nao e de papel nenhum passa pela leitura do JSON — e pararia
        // na trava do banco, como erro nao previsto.
        if (!Enum.IsDefined(papel))
            throw new ArgumentException("Informe um papel valido: administrador ou membro.");
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var membro = await RequireMemberAsync(project, userPublicId, "O dono do projeto nao muda de papel.", cancellationToken);

        if (membro.Role != papel)
        {
            var antes = membro.Role;
            // Sem `Update`: a linha ja e rastreada, e so o papel e gravado. O `Update`
            // gravaria a linha inteira — inclusive o `deleted_at` lido antes de uma
            // remocao feita no meio, trazendo a pessoa de volta ao time.
            membro.Role = papel;

            await AddEventAsync(project, EventTypeEnum.ProjectMemberRoleChanged, new
            {
                user_public_id = membro.User.PublicId,
                from = Snake(antes),
                to = Snake(papel),
            }, cancellationToken);

            await _unitOfWork.CommitAsync(cancellationToken);
        }

        return Map(membro, _accountContext.UserId);
    }

    public async Task RemoveAsync(Guid projectPublicId, Guid userPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var membro = await RequireMemberAsync(project, userPublicId, "O dono do projeto nao sai do time.", cancellationToken);

        await _unitOfWork.ProjectMembers.SoftDeleteAsync(membro, cancellationToken);

        await AddEventAsync(project, EventTypeEnum.ProjectMemberRemoved, new
        {
            user_public_id = membro.User.PublicId,
            role = Snake(membro.Role),
        }, cancellationToken);

        await _unitOfWork.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// A linha de alguem no time. O dono e recusado antes de procurar: ele nao tem
    /// linha, e "nao encontrado" esconderia o motivo de verdade.
    /// </summary>
    private async Task<ProjectMember> RequireMemberAsync(Project project, Guid userPublicId, string mensagemDoDono, CancellationToken cancellationToken)
    {
        var pessoa = await _unitOfWork.Users.GetByPublicIdAsync(userPublicId, cancellationToken)
                     ?? throw new KeyNotFoundException("Pessoa nao encontrada no time.");

        if (pessoa.AccountId == project.AccountId)
            throw new ConflictException(mensagemDoDono);

        return await _unitOfWork.ProjectMembers.GetByProjectAndUserAsync(project.Id, pessoa.Id, cancellationToken)
               ?? throw new KeyNotFoundException("Pessoa nao encontrada no time.");
    }

    private Task AddEventAsync(Project project, EventTypeEnum tipo, object payload, CancellationToken cancellationToken)
        => _unitOfWork.Events.AddAsync(new Event
        {
            AccountId = project.AccountId,
            ProjectId = project.Id,
            UserId = _accountContext.UserId,
            Type = tipo,
            Source = EventSourceEnum.Panel,
            Payload = JsonSerializer.Serialize(payload),
        }, cancellationToken);

    private static TeamMemberViewModel Map(ProjectMember membro, long? eu) => new(
        membro.User.PublicId, membro.User.Name, membro.User.Email, membro.User.AvatarUrl,
        membro.Role, IsAccountOwner: false, IsYou: membro.UserId == eu, JoinedAt: membro.CreatedAt);

    private static string Snake(ProjectRoleEnum papel)
        => papel == ProjectRoleEnum.Administrator ? "administrator" : "member";

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
