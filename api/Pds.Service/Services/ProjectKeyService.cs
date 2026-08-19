using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Security;

namespace Pds.Service.Services;

public class ProjectKeyService : IProjectKeyService
{
    private readonly IUnitOfWork _unitOfWork;

    public ProjectKeyService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<ProjectKeyViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var keys = await _unitOfWork.ProjectKeys.ListByProjectAsync(project.Id, cancellationToken);

        // A secreta sai sem valor porque o banco nao tem o valor dela para devolver.
        // Nao e a tela que esconde: nao ha o que esconder.
        return keys.Select(Map).ToList();
    }

    public async Task<RevealedSecretKeyViewModel> RegenerateSecretAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        var current = await _unitOfWork.ProjectKeys.GetActiveAsync(project.Id, ProjectKeyTypeEnum.Secret, cancellationToken);

        if (current is not null)
        {
            // Revogar preenche a data e mantem a linha. A anterior nao e
            // sobrescrita: e o registro de quando cada chave valeu que permite
            // investigar um incidente depois.
            current.RevokedAt = DateTime.UtcNow;
            _unitOfWork.ProjectKeys.Update(current);
        }

        var (value, prefix, hash) = ProjectKeyGenerator.GenerateSecret();
        var key = new ProjectKey
        {
            ProjectId = project.Id,
            Type = ProjectKeyTypeEnum.Secret,
            Hash = hash,
            Prefix = prefix,
        };

        await _unitOfWork.ProjectKeys.AddAsync(key, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        // Unica vez em que o valor sai daqui.
        return new RevealedSecretKeyViewModel(key.PublicId, value, key.Prefix, key.CreatedAt);
    }

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    private static ProjectKeyViewModel Map(ProjectKey key) => new(
        key.PublicId,
        key.Type,
        key.Value,
        key.Prefix,
        key.IsActive,
        key.CreatedAt,
        key.RevokedAt,
        key.LastUsedAt);
}
