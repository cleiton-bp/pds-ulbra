using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IReportService
{
    /// <summary>
    /// Recebe um relato da ferramenta embutida, sem sessao. Resolve o projeto pela
    /// chave publica, grava o relato com o contexto que veio junto e registra o
    /// evento de criacao.
    ///
    /// <para>Devolve o protocolo e o token de acompanhamento — e o token sai daqui
    /// uma unica vez.</para>
    /// </summary>
    Task<CreatedReportViewModel> CreateAsync(CreateReportDto dto, CancellationToken cancellationToken = default);
}
