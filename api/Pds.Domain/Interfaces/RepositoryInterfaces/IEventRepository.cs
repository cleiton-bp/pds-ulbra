using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>
/// Unico repositorio do sistema que nao herda de <c>IBaseRepository</c>, e a
/// interface diz por que: a tabela so cresce. Nao ha <c>Update</c> nem
/// <c>SoftDelete</c> para oferecer, e oferecer assinaturas que ninguem pode chamar
/// seria convidar alguem a chama-las.
/// </summary>
public interface IEventRepository
{
    Task<Event> AddAsync(Event entity, CancellationToken cancellationToken = default);
}
