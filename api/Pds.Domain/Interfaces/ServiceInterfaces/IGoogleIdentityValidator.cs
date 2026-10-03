namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>Identidade confirmada pelo Google a partir do token de login.</summary>
/// <param name="Subject">O sub do Google: o identificador estavel da pessoa.</param>
/// <param name="Email">O e-mail da conta Google.</param>
/// <param name="Name">O nome da conta Google.</param>
/// <param name="PictureUrl">A foto da conta Google.</param>
/// <param name="EmailVerified">Se o Google confirmou que a pessoa e dona do e-mail.</param>
public record GoogleIdentity(string Subject, string? Email, string? Name, string? PictureUrl, bool EmailVerified = false);

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
