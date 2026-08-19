namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>Identidade confirmada pelo Google a partir do token de login.</summary>
public record GoogleIdentity(string Subject, string? Email, string? Name, string? PictureUrl);

/// <summary>
/// Confere com o Google se o token de login e autentico e foi emitido para a nossa
/// aplicacao.
///
/// Fica atras de interface para que o teste consiga simular um login sem depender
/// de rede e sem uma conta Google de verdade.
/// </summary>
public interface IGoogleIdentityValidator
{
    /// <summary>Valida o token e devolve a identidade. Lanca se o token nao for valido.</summary>
    Task<GoogleIdentity> ValidateAsync(string idToken, CancellationToken cancellationToken = default);
}
