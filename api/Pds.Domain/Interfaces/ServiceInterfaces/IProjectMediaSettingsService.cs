using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>O que um projeto aceita receber junto do relato.</summary>
public interface IProjectMediaSettingsService
{
    /// <summary>A configuracao do projeto, salva ou padrao. Nunca vazia.</summary>
    Task<MediaSettingsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// O que a ferramenta precisa saber, pela chave publica do projeto.
    ///
    /// <para>Sem sessao, como a leitura da propria ferramenta: quem chama e o quadro
    /// dentro do site do cliente, e la nao ha conta nenhuma logada.</para>
    /// </summary>
    Task<PublicMediaSettingsViewModel> GetByPublicKeyAsync(
        string? key,
        string? origin,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// O mesmo que a ferramenta ve, pela porta do acompanhamento: protocolo e token.
    ///
    /// <para>A pagina de quem relatou nao tem a chave publica do projeto — ela
    /// chegou pelo link, que carrega so o relato. E e ali que se responde ao time,
    /// com ou sem arquivo.</para>
    /// </summary>
    Task<PublicMediaSettingsViewModel> GetForTrackingAsync(
        OpenReportTrackingDto dto,
        CancellationToken cancellationToken = default);

    /// <summary>Grava a configuracao inteira, com os limites de cada tipo.</summary>
    Task<MediaSettingsViewModel> ReplaceAsync(Guid projectPublicId, MediaSettingsDto dto, CancellationToken cancellationToken = default);
}
