using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;

namespace Pds.Service.Services;

/// <summary>
/// Login e sessao do painel.
///
/// Nao existe tela de cadastro: quem entra pela primeira vez ganha conta e usuario
/// no mesmo movimento. Uma tela a menos para o usuario e um estado a menos para o
/// sistema — nao ha "conta criada mas sem ninguem dentro".
/// </summary>
public class AuthService : IAuthService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IGoogleIdentityValidator _googleValidator;
    private readonly ITokenService _tokenService;
    private readonly IAccountContext _accountContext;

    public AuthService(
        IUnitOfWork unitOfWork,
        IGoogleIdentityValidator googleValidator,
        ITokenService tokenService,
        IAccountContext accountContext)
    {
        _unitOfWork = unitOfWork;
        _googleValidator = googleValidator;
        _tokenService = tokenService;
        _accountContext = accountContext;
    }

    public async Task<SignInViewModel> SignInWithGoogleAsync(GoogleSignInDto dto, CancellationToken cancellationToken = default)
    {
        var identity = await _googleValidator.ValidateAsync(dto.IdToken ?? string.Empty, cancellationToken);

        // A busca e pelo sub, nunca pelo e-mail. O e-mail da conta Google pode mudar
        // de dono; o sub, nao. Procurar por e-mail e o que faz alguem herdar um
        // endereco antigo e entrar na conta de outra pessoa.
        var user = await _unitOfWork.Users.GetByGoogleSubjectAsync(identity.Subject, cancellationToken);

        user ??= await CreateAccountAndUserAsync(identity, cancellationToken);

        // Dados do Google podem ter mudado desde o ultimo acesso; a sessao e o
        // momento natural de acompanhar.
        user.Email = identity.Email;
        user.Name = identity.Name;
        user.AvatarUrl = identity.PictureUrl;
        user.LastLoginAt = DateTime.UtcNow;

        _unitOfWork.Users.Update(user);
        await _unitOfWork.CommitAsync(cancellationToken);

        var (accessToken, expiresAt) = _tokenService.Issue(user);
        return new SignInViewModel(accessToken, expiresAt, Map(user));
    }

    public async Task<MeViewModel> GetCurrentAsync(CancellationToken cancellationToken = default)
    {
        var userId = _accountContext.UserId
                     ?? throw new UnauthorizedAccessException("Sessao nao identificada.");

        var user = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken)
                   ?? throw new UnauthorizedAccessException("Sessao nao identificada.");

        // A conta vem por navegacao porque GetByIdAsync nao carrega relacionamento.
        user.Account = await _unitOfWork.Accounts.GetByIdAsync(user.AccountId, cancellationToken)
                       ?? throw new UnauthorizedAccessException("Sessao nao identificada.");

        return Map(user);
    }

    /// <summary>Primeiro acesso: nasce a conta e o usuario juntos, numa unica gravacao.</summary>
    private async Task<User> CreateAccountAndUserAsync(GoogleIdentity identity, CancellationToken cancellationToken)
    {
        var account = new Account { Name = BuildAccountName(identity) };
        await _unitOfWork.Accounts.AddAsync(account, cancellationToken);

        var user = new User
        {
            Account = account,
            GoogleSubject = identity.Subject,
            Email = identity.Email,
            Name = identity.Name,
            AvatarUrl = identity.PictureUrl,
        };
        await _unitOfWork.Users.AddAsync(user, cancellationToken);

        return user;
    }

    /// <summary>
    /// Nome inicial da conta. E so um ponto de partida editavel: melhor abrir o
    /// painel com "Conta de Maria" do que parar a pessoa numa tela pedindo um nome
    /// que ela ainda nao pensou.
    /// </summary>
    private static string BuildAccountName(GoogleIdentity identity)
    {
        if (!string.IsNullOrWhiteSpace(identity.Name))
            return $"Conta de {identity.Name.Trim()}";

        if (!string.IsNullOrWhiteSpace(identity.Email))
            return $"Conta de {identity.Email.Split('@')[0]}";

        return "Minha conta";
    }

    private static MeViewModel Map(User user) => new(
        user.PublicId,
        user.Name,
        user.Email,
        user.AvatarUrl,
        user.LastLoginAt,
        new AccountViewModel(user.Account.PublicId, user.Account.Name, user.Account.CreatedAt));
}
