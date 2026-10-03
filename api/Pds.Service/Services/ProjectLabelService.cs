using System.Text.Json;
using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Cards;

namespace Pds.Service.Services;

/// <summary>
/// As etiquetas de um projeto.
///
/// <para><b>Quem cria e o time, ao etiquetar</b> — faltar a etiqueta certa nao pode
/// virar pedido ao administrador. O administrador organiza: renomeia, troca a cor,
/// apaga.</para>
/// </summary>
public class ProjectLabelService : IProjectLabelService
{
    private const string Que = "a etiqueta";

    /// <summary>
    /// A ordem em que a etiqueta sem cor escolhida ganha uma: a menos usada no projeto,
    /// e no empate a primeira desta lista. O cinza fica por ultimo — e a cor de quem
    /// nao quis cor.
    /// </summary>
    private static readonly CardColorEnum[] OrdemDasCores =
    [
        CardColorEnum.Blue, CardColorEnum.Green, CardColorEnum.Purple, CardColorEnum.Orange,
        CardColorEnum.Pink, CardColorEnum.Yellow, CardColorEnum.Red, CardColorEnum.Gray,
    ];

    private readonly IUnitOfWork _unitOfWork;
    private readonly IAccountContext _accountContext;

    public ProjectLabelService(IUnitOfWork unitOfWork, IAccountContext accountContext)
    {
        _unitOfWork = unitOfWork;
        _accountContext = accountContext;
    }

    public async Task<IReadOnlyList<ProjectLabelViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var labels = await _unitOfWork.ProjectLabels.ListByProjectAsync(project.Id, cancellationToken);
        var cards = await _unitOfWork.ProjectLabels.CountCardsAsync(project.Id, cancellationToken);

        return labels.Select(label => Map(label, cards.GetValueOrDefault(label.Id))).ToList();
    }

    /// <summary>
    /// Cria a etiqueta. <b>O nome que ja existe devolve a etiqueta que existe</b>, sem
    /// diferenciar maiuscula: quem digitou "Pagamento" queria a "pagamento" que ja
    /// estava la — duas etiquetas iguais so separariam o que era para ficar junto.
    /// </summary>
    public async Task<(ProjectLabelViewModel Label, bool Created)> CreateAsync(Guid projectPublicId, CreateProjectLabelDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var name = CardText.Name(dto.Name, ProjectLabel.MaxNameLength, Que);

        if (dto.Color is CardColorEnum escolhida && !Enum.IsDefined(escolhida))
            throw new ArgumentException("Escolha uma cor da paleta.");

        return await _unitOfWork.InTransactionAsync(async ct =>
        {
            // **Um nome de cada vez no projeto.** Dois "pagamento" juntos — o Enter
            // duplo, ou duas pessoas etiquetando ao mesmo tempo — viram uma etiqueta so,
            // e o segundo recebe a do primeiro. Sem a trava os dois veriam o nome livre:
            // o indice recusaria um deles com erro, e "Pagamento" e "pagamento", que o
            // indice nao confunde, entrariam as duas.
            await _unitOfWork.ProjectLabels.LockNamesAsync(project.Id, ct);

            var existente = await _unitOfWork.ProjectLabels.FindByNameAsync(project.Id, name, ct);
            if (existente is not null)
            {
                var cards = await _unitOfWork.ProjectLabels.CountCardsAsync(project.Id, ct);
                return (Map(existente, cards.GetValueOrDefault(existente.Id)), false);
            }

            var label = new ProjectLabel
            {
                ProjectId = project.Id,
                Name = name,
                Color = dto.Color ?? await LeastUsedColorAsync(project.Id, ct),
            };

            await _unitOfWork.ProjectLabels.AddAsync(label, ct);
            await _unitOfWork.CommitAsync(ct);

            return (Map(label, 0), true);
        }, cancellationToken);
    }

    public async Task<ProjectLabelViewModel> UpdateAsync(Guid projectPublicId, Guid labelPublicId, UpdateProjectLabelDto dto, CancellationToken cancellationToken = default)
    {
        var (project, label) = await RequireLabelAsync(projectPublicId, labelPublicId, cancellationToken);
        var name = CardText.Name(dto.Name, ProjectLabel.MaxNameLength, Que);
        var color = dto.Color ?? throw new ArgumentException("Escolha a cor da etiqueta.");

        if (!Enum.IsDefined(color))
            throw new ArgumentException("Escolha uma cor da paleta.");

        return await _unitOfWork.InTransactionAsync(async ct =>
        {
            // A mesma trava de criar: renomear para o nome que alguem esta criando agora
            // espera a criacao terminar, e encontra o nome ocupado.
            await _unitOfWork.ProjectLabels.LockNamesAsync(project.Id, ct);

            if (await _unitOfWork.ProjectLabels.NameExistsAsync(project.Id, name, label.Id, ct))
                throw new ConflictException("Este projeto ja tem uma etiqueta com este nome.");

            label.Name = name;
            label.Color = color;
            await _unitOfWork.CommitAsync(ct);

            var cards = await _unitOfWork.ProjectLabels.CountCardsAsync(project.Id, ct);
            return Map(label, cards.GetValueOrDefault(label.Id));
        }, cancellationToken);
    }

    /// <summary>
    /// Apaga a etiqueta e a tira de todos os cards, numa gravacao so.
    ///
    /// <para><b>Cada card conta a saida na propria historia</b>, como se alguem a
    /// tivesse tirado ali — e foi quem apagou. Sem isso a historia mostraria a etiqueta
    /// entrando e nunca saindo, num card que ja nao a tem. Os eventos de antes
    /// continuam com o nome da epoca.</para>
    /// </summary>
    public async Task DeleteAsync(Guid projectPublicId, Guid labelPublicId, CancellationToken cancellationToken = default)
    {
        var (project, label) = await RequireLabelAsync(projectPublicId, labelPublicId, cancellationToken);
        var agora = DateTime.UtcNow;

        // O mesmo formato de quando alguem tira a etiqueta do card: a historia le um so.
        var saida = JsonSerializer.Serialize(new
        {
            added = Array.Empty<object>(),
            removed = new[] { new { id = label.PublicId, name = label.Name } },
        });

        foreach (var link in await _unitOfWork.ReportLabels.ListByLabelAsync(label.Id, cancellationToken))
        {
            link.DeletedAt = agora;

            await _unitOfWork.Events.AddAsync(new Event
            {
                AccountId = project.AccountId,
                ProjectId = project.Id,
                ReportId = link.ReportId,
                UserId = _accountContext.UserId,
                Type = EventTypeEnum.CardLabelsChanged,
                Source = EventSourceEnum.Panel,
                Payload = saida,
            }, cancellationToken);
        }

        label.DeletedAt = agora;
        await _unitOfWork.CommitAsync(cancellationToken);
    }

    private async Task<CardColorEnum> LeastUsedColorAsync(long projectId, CancellationToken cancellationToken)
    {
        var uso = await _unitOfWork.ProjectLabels.CountByColorAsync(projectId, cancellationToken);
        return OrdemDasCores.MinBy(cor => uso.GetValueOrDefault(cor));
    }

    private async Task<(Project Project, ProjectLabel Label)> RequireLabelAsync(Guid projectPublicId, Guid labelPublicId, CancellationToken cancellationToken)
    {
        var project = await RequireProjectAsync(projectPublicId, cancellationToken);
        var label = await _unitOfWork.ProjectLabels.GetByPublicIdAsync(labelPublicId, cancellationToken);

        // Como na prioridade: o filtro global garante o acesso ao projeto da etiqueta,
        // e nao que ela e deste.
        if (label is null || label.ProjectId != project.Id)
            throw new KeyNotFoundException("Etiqueta nao encontrada neste projeto.");

        return (project, label);
    }

    private async Task<Project> RequireProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");

    private static ProjectLabelViewModel Map(ProjectLabel label, int cardCount) => new(
        label.PublicId,
        label.Name,
        label.Color,
        cardCount,
        label.CreatedAt);
}
