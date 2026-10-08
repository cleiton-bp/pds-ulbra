using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// Os comentarios de um relato.
///
/// <para><b>Sao dois metodos de escrita, e nao um com um parametro dizendo qual.</b>
/// Um parametro de visibilidade seria o sinalizador que as duas tabelas existem
/// para evitar: bastaria um valor errado, vindo de qualquer lugar, para o texto
/// interno acabar na tabela que vai ser lida de fora.</para>
/// </summary>
public interface IReportCommentService
{
    /// <summary>
    /// Os comentarios do relato, em duas listas separadas.
    ///
    /// <para>Exige sessao, como toda rota do painel — e nao existe nenhuma rota
    /// publica que alcance esta.</para>
    /// </summary>
    Task<ReportCommentsViewModel> ListAsync(Guid projectPublicId, Guid reportPublicId, CancellationToken cancellationToken = default);

    /// <summary>Escreve um comentario que fica entre o time.</summary>
    Task<InternalCommentViewModel> AddInternalAsync(Guid projectPublicId, Guid reportPublicId, CreateInternalCommentDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Corrige um comentario interno. So quem o escreveu; as mencoes passam a ser as do
    /// texto novo — quem entrou e avisado, e o aviso de quem saiu sai junto.
    /// </summary>
    Task<InternalCommentViewModel> EditInternalAsync(Guid projectPublicId, Guid reportPublicId, Guid commentPublicId, EditInternalCommentDto dto, CancellationToken cancellationToken = default);

    /// <summary>Apaga um comentario interno. So quem o escreveu; os avisos da mencao saem junto.</summary>
    Task DeleteInternalAsync(Guid projectPublicId, Guid reportPublicId, Guid commentPublicId, CancellationToken cancellationToken = default);

    /// <summary>Escreve um comentario para quem relatou.</summary>
    Task<PublicCommentViewModel> AddPublicAsync(Guid projectPublicId, Guid reportPublicId, CreatePublicCommentDto dto, CancellationToken cancellationToken = default);
}
