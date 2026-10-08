using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>As sprints do projeto: planejar, iniciar, fechar e apagar.</summary>
public interface ISprintService
{
    /// <summary>
    /// As que nao fecharam: a em andamento primeiro, depois as planejadas, com os numeros.
    /// Com <paramref name="withClosed"/>, tambem as concluidas, depois delas, da mais
    /// recente para a mais antiga.
    /// </summary>
    Task<IReadOnlyList<SprintViewModel>> ListAsync(Guid projectPublicId, bool withClosed = false, CancellationToken cancellationToken = default);

    /// <summary>Uma sprint planejada nova, com o nome e as datas de fabrica quando nao vierem.</summary>
    Task<SprintViewModel> CreateAsync(Guid projectPublicId, SaveSprintDto dto, CancellationToken cancellationToken = default);

    /// <summary>Muda o nome, o objetivo e as datas. A fechada nao muda.</summary>
    Task<SprintViewModel> UpdateAsync(Guid projectPublicId, Guid sprintPublicId, SaveSprintDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Inicia uma planejada, sem outra em andamento — com o nome, o objetivo e as datas que
    /// vierem; sem datas, comeca hoje (o dia de quem inicia) e dura o padrao do projeto.
    /// </summary>
    Task<SprintViewModel> StartAsync(Guid projectPublicId, Guid sprintPublicId, SaveSprintDto? dto, CancellationToken cancellationToken = default);

    /// <summary>Fecha a em andamento, levando o que nao terminou para o destino escolhido.</summary>
    Task<CloseSprintResultViewModel> CloseAsync(Guid projectPublicId, Guid sprintPublicId, CloseSprintDto dto, CancellationToken cancellationToken = default);

    /// <summary>Apaga uma planejada; os cards dela voltam para o backlog.</summary>
    Task DeleteAsync(Guid projectPublicId, Guid sprintPublicId, CancellationToken cancellationToken = default);
}
