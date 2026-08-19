using Google.Apis.Auth;
using Pds.Domain.Constants;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Service.Security;

/// <summary>
/// Confere o token de login com o Google.
///
/// <para>A validacao busca as chaves publicas do Google e verifica assinatura,
/// emissor, validade e destinatario. O destinatario e o ponto que mais se esquece:
/// sem exigir que o token tenha sido emitido para o <i>nosso</i> client ID,
/// qualquer token valido do Google, emitido para qualquer outro site, seria aceito
/// aqui — e entrar viraria questao de ter um token, nao de ser a pessoa.</para>
/// </summary>
public class GoogleIdentityValidator : IGoogleIdentityValidator
{
    public async Task<GoogleIdentity> ValidateAsync(string idToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(idToken))
            throw new UnauthorizedAccessException("Token do Google nao informado.");

        var settings = new GoogleJsonWebSignature.ValidationSettings
        {
            Audience = [EnvironmentConstants.GetGoogleClientId()]
        };

        GoogleJsonWebSignature.Payload payload;
        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);
        }
        catch (InvalidJwtException)
        {
            // A mensagem original diz por que o token e invalido. Isso ajuda quem
            // ataca e nao ajuda quem usa, entao fica so no log.
            throw new UnauthorizedAccessException("Token do Google invalido ou expirado.");
        }

        if (string.IsNullOrWhiteSpace(payload.Subject))
            throw new UnauthorizedAccessException("Token do Google sem identificador de usuario.");

        return new GoogleIdentity(payload.Subject, payload.Email, payload.Name, payload.Picture);
    }
}
