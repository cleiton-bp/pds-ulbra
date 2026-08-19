using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Security;

namespace Pds.Service.Services;

public class ProjectService : IProjectService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAccountContext _accountContext;

    public ProjectService(IUnitOfWork unitOfWork, IAccountContext accountContext)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
    }

    /// <summary>A conta vem sempre da sessao. Nenhuma rota aceita conta por parametro.</summary>
    private long AccountId => _accountContext.AccountId
                              ?? throw new UnauthorizedAccessException("Sessao sem conta.");

    public async Task<ProjectCreatedViewModel> CreateAsync(CreateProjectDto dto, CancellationToken cancellationToken = default)
    {
        var name = (dto.Name ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("O nome do projeto e obrigatorio.");

        if (await _unitOfWork.Projects.NameExistsAsync(name, cancellationToken: cancellationToken))
            throw new ConflictException("Ja existe um projeto com este nome na conta.");

        var project = new Project
        {
            AccountId = AccountId,
            Name = name,
            Status = ProjectStatusEnum.Active,
        };
        await _unitOfWork.Projects.AddAsync(project, cancellationToken);

        // O par de chaves nasce junto com o projeto: sem elas o projeto nao serve
        // para nada, e obrigar a um segundo passo so cria a chance de esquecer.
        var (publicValue, publicPrefix) = ProjectKeyGenerator.GeneratePublic();
        var publicKey = new ProjectKey
        {
            Project = project,
            Type = ProjectKeyTypeEnum.Public,
            Value = publicValue,
            Prefix = publicPrefix,
        };

        var (secretValue, secretPrefix, secretHash) = ProjectKeyGenerator.GenerateSecret();
        var secretKey = new ProjectKey
        {
            Project = project,
            Type = ProjectKeyTypeEnum.Secret,
            Hash = secretHash,
            Prefix = secretPrefix,
        };

        await _unitOfWork.ProjectKeys.AddAsync(publicKey, cancellationToken);
        await _unitOfWork.ProjectKeys.AddAsync(secretKey, cancellationToken);

        // Um unico commit: ou o projeto e as duas chaves entram, ou nao entra nada.
        await _unitOfWork.CommitAsync(cancellationToken);

        return new ProjectCreatedViewModel(
            Map(project),
            MapKey(publicKey),
            new RevealedSecretKeyViewModel(secretKey.PublicId, secretValue, secretKey.Prefix, secretKey.CreatedAt));
    }

    public async Task<IReadOnlyList<ProjectViewModel>> ListAsync(CancellationToken cancellationToken = default)
    {
        var projects = await _unitOfWork.Projects.ListAsync(cancellationToken);
        return projects.Select(Map).ToList();
    }

    public async Task<ProjectViewModel> GetAsync(Guid publicId, CancellationToken cancellationToken = default)
        => Map(await RequireProjectAsync(publicId, cancellationToken));

    public async Task<ProjectViewModel> UpdateAsync(Guid publicId, UpdateProjectDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(publicId, cancellationToken);

        if (dto.Name is not null)
        {
            var name = dto.Name.Trim();

            if (string.IsNullOrWhiteSpace(name))
                throw new ArgumentException("O nome do projeto e obrigatorio.");

            if (await _unitOfWork.Projects.NameExistsAsync(name, project.Id, cancellationToken))
                throw new ConflictException("Ja existe um projeto com este nome na conta.");

            project.Name = name;
        }

        if (dto.Status is not null)
            project.Status = dto.Status.Value;

        _unitOfWork.Projects.Update(project);
        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(project);
    }

    /// <summary>
    /// Busca o projeto da conta atual pelo identificador publico.
    ///
    /// Projeto de outra conta cai aqui como "nao encontrado", e nao como "sem
    /// permissao" — o filtro global simplesmente nao o devolve. E a resposta certa
    /// tambem do ponto de vista de quem pergunta: dizer "existe, mas nao e seu" ja
    /// e contar que existe.
    /// </summary>
    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    private static ProjectViewModel Map(Project project) => new(
        project.PublicId,
        project.Name,
        project.Status,
        project.CreatedAt,
        project.UpdatedAt);

    private static ProjectKeyViewModel MapKey(ProjectKey key) => new(
        key.PublicId,
        key.Type,
        key.Value,
        key.Prefix,
        key.IsActive,
        key.CreatedAt,
        key.RevokedAt,
        key.LastUsedAt);
}
