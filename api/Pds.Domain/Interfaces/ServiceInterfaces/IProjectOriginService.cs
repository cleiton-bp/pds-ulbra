using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IProjectOriginService
{
    /// <summary>Enderecos autorizados do projeto, em ordem alfabetica.</summary>
    Task<IReadOnlyList<ProjectOriginViewModel>> ListAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Autoriza um endereco. O dominio e normalizado antes de gravar, e o mesmo
    /// endereco nao entra duas vezes no projeto.
    /// </summary>
    Task<ProjectOriginViewModel> CreateAsync(Guid projectPublicId, CreateProjectOriginDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Retira a autorizacao. E exclusao logica: a linha fica, para o historico
    /// contar quando cada endereco valeu.
    /// </summary>
    Task DeleteAsync(Guid projectPublicId, Guid originPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os enderecos que ja mandaram relatos, com quantos, o ultimo quando e como o
    /// projeto os trata hoje. Do mais recente para o mais antigo, ate cem.
    /// </summary>
    Task<IReadOnlyList<ObservedOriginViewModel>> ListObservedAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>Os enderecos bloqueados, do mais novo para o mais antigo, com os marcados de cada um.</summary>
    Task<IReadOnlyList<ProjectBlockedOriginViewModel>> ListBlockedAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Bloqueia um endereco. Vale na hora, mesmo com a lista de autorizados vazia; e o
    /// mesmo endereco sai da lista de autorizados, se estava nela.
    /// </summary>
    Task<ProjectBlockedOriginViewModel> BlockAsync(Guid projectPublicId, CreateProjectBlockedOriginDto dto, CancellationToken cancellationToken = default);

    /// <summary>Desbloqueia. Os relatos de la deixam de estar marcados.</summary>
    Task UnblockAsync(Guid projectPublicId, Guid blockedPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// "Aguardando liberacao": os relatos retidos, contados por endereco — os que
    /// chegaram de fora da lista de autorizados, ou sem dizer de onde vieram.
    /// </summary>
    Task<IReadOnlyList<HeldOriginViewModel>> ListPendingAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Libera os retidos deste endereco exato (ou os sem endereco) sem mexer nas listas:
    /// entram no Trabalho, e o proximo relato de la fica retido de novo.
    /// </summary>
    Task<HeldOriginReportsResultViewModel> ReleasePendingAsync(Guid projectPublicId, HeldOriginReportsDto dto, CancellationToken cancellationToken = default);

    /// <summary>Apaga de vez os retidos deste endereco exato (ou os sem endereco), sem mexer nas listas.</summary>
    Task<HeldOriginReportsResultViewModel> DeletePendingAsync(Guid projectPublicId, HeldOriginReportsDto dto, CancellationToken cancellationToken = default);
}
