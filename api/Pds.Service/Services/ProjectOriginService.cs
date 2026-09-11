using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Origins;

namespace Pds.Service.Services;

public class ProjectOriginService : IProjectOriginService
{
    /// <summary>
    /// Teto por projeto. A lista inteira vira um cabecalho <c>frame-ancestors</c>
    /// em toda abertura da ferramenta, e cabecalho tem tamanho util limitado — sem
    /// teto, uma lista grande demais passa a ser recusada pelo servidor e a
    /// ferramenta para de abrir em todo lugar de uma vez.
    /// </summary>
    private const int MaxOriginsPerProject = 50;

    private readonly IUnitOfWork _unitOfWork;

    public ProjectOriginService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<ProjectOriginViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var origins = await _unitOfWork.ProjectOrigins.ListByProjectAsync(project.Id, cancellationToken);

        return origins.Select(Map).ToList();
    }

    public async Task<ProjectOriginViewModel> CreateAsync(Guid projectPublicId, CreateProjectOriginDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        // Normaliza antes de qualquer conferencia: e a forma normalizada que o
        // duplicado compara e que o indice unico do banco enxerga.
        var (domain, wildcard) = OriginDomain.Normalize(dto.Domain);

        // Curinga digitado liga a opcao, e nunca a desliga: quem escreveu
        // *.site.com pediu os subdominios, mesmo com a caixa desmarcada.
        var allowsSubdomains = dto.AllowsSubdomains || wildcard;

        if (await _unitOfWork.ProjectOrigins.DomainExistsAsync(project.Id, domain, cancellationToken))
            throw new ConflictException("Este dominio ja esta autorizado neste projeto.");

        var total = await _unitOfWork.ProjectOrigins.CountByProjectAsync(project.Id, cancellationToken);
        if (total >= MaxOriginsPerProject)
            throw new ConflictException($"Um projeto pode autorizar ate {MaxOriginsPerProject} dominios.");

        var origin = new ProjectOrigin
        {
            ProjectId = project.Id,
            Domain = domain,
            AllowsSubdomains = allowsSubdomains,
        };

        await _unitOfWork.ProjectOrigins.AddAsync(origin, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(origin);
    }

    public async Task DeleteAsync(Guid projectPublicId, Guid originPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);

        var origin = await _unitOfWork.ProjectOrigins.GetByPublicIdAsync(originPublicId, cancellationToken);

        // O filtro global ja garante que o endereco e da conta da sessao, mas nao
        // que e **deste** projeto: sem esta conferencia, o identificador de um
        // endereco de outro projeto da mesma conta seria aceito pela rota errada.
        if (origin is null || origin.ProjectId != project.Id)
            throw new KeyNotFoundException("Dominio nao encontrado neste projeto.");

        await _unitOfWork.ProjectOrigins.SoftDeleteAsync(origin, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);
    }

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    private static ProjectOriginViewModel Map(ProjectOrigin origin) => new(
        origin.PublicId,
        origin.Domain,
        origin.AllowsSubdomains,
        origin.CreatedAt);
}
