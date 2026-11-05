using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>Como quem relata e identificado num projeto: ler e trocar.</summary>
public interface IProjectIdentitySettingsService
{
    /// <summary>
    /// O modo deste projeto. <b>Nunca devolve vazio</b>: sem linha salva, vale o
    /// padrao de fabrica.
    /// </summary>
    Task<IdentitySettingsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Troca a configuracao inteira, criando a linha se ela ainda nao existir.
    ///
    /// <para><b>Trocar de modo nao reescreve o passado.</b> Relato que entrou sob
    /// outro modo continua como entrou e continua abrindo pelo link — o modo decide
    /// o que acontece daqui para frente.</para>
    /// </summary>
    Task<IdentitySettingsViewModel> ReplaceAsync(Guid projectPublicId, IdentitySettingsDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// A chave secreta do HMAC deste projeto, para o administrador colar no servidor dele.
    /// Recusa quando a instalacao nao tem a chave mestra.
    /// </summary>
    Task<IdentitySecretViewModel> GetSecretAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Troca a chave secreta do HMAC deste projeto e devolve a nova. Todo cracha assinado
    /// com a anterior deixa de valer na hora.
    /// </summary>
    Task<IdentitySecretViewModel> RotateSecretAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// As ultimas chaves secretas do HMAC que ja nao valem, da troca mais recente para a mais
    /// antiga, cada uma so com o comeco e a data da troca.
    /// </summary>
    Task<IReadOnlyList<IdentitySecretHistoryItemViewModel>> GetSecretHistoryAsync(Guid projectPublicId, CancellationToken cancellationToken = default);
}
