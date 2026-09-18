using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IProjectStatusMappingService
{
    /// <summary>O mapa que vale agora, com todo estado do projeto dentro.</summary>
    Task<ProjectStatusMappingViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Grava o mapa inteiro, criando uma versao nova.
    ///
    /// <para>Pedido igual ao que ja vale <b>nao</b> cria versao: um clique em
    /// "salvar" sem ter mudado nada nao pode reescrever a historia.</para>
    /// </summary>
    Task<ProjectStatusMappingViewModel> SaveAsync(Guid projectPublicId, SaveStatusMappingDto dto, CancellationToken cancellationToken = default);
}
