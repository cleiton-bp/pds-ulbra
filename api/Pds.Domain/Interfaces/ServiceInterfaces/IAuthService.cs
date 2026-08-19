using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IAuthService
{
    /// <summary>
    /// Entra com o Google. Se o <c>sub</c> ja for conhecido, apenas abre a sessao;
    /// se for novo, cria a conta e o usuario no mesmo movimento — nao existe tela
    /// de cadastro separada.
    /// </summary>
    Task<SignInViewModel> SignInWithGoogleAsync(GoogleSignInDto dto, CancellationToken cancellationToken = default);

    /// <summary>Usuario e conta da sessao atual.</summary>
    Task<MeViewModel> GetCurrentAsync(CancellationToken cancellationToken = default);
}
