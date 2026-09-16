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

    /// <summary>Escreve um comentario para quem relatou.</summary>
    Task<PublicCommentViewModel> AddPublicAsync(Guid projectPublicId, Guid reportPublicId, CreatePublicCommentDto dto, CancellationToken cancellationToken = default);
}
