namespace Pds.Domain.ViewModels;

/// <summary>Resposta do login: o token da sessao e quem entrou.</summary>
/// <param name="AccessToken">Token da sessao. Vai no cabecalho <c>Authorization: Bearer</c> das demais rotas.</param>
/// <param name="ExpiresAt">Quando o token deixa de valer, em UTC.</param>
/// <param name="User">Usuario e conta de quem entrou.</param>
public record SignInViewModel(
    string AccessToken,
    DateTime ExpiresAt,
    MeViewModel User);

/// <summary>Usuario da sessao atual, com a conta propria dele.</summary>
/// <param name="PublicId">Identificador publico do usuario.</param>
/// <param name="Name">Nome vindo do Google.</param>
/// <param name="Email">E-mail vindo do Google. Serve para contato, nao como identidade.</param>
/// <param name="AvatarUrl">Foto vinda do Google. Pode ser nula.</param>
/// <param name="LastLoginAt">Acesso anterior a este, em UTC. Nulo no primeiro acesso.</param>
/// <param name="Account">Conta propria do usuario — a que nasceu no primeiro acesso. Os projetos de outras contas em que ele entrou vem na lista de projetos, cada um com a sua conta.</param>
public record MeViewModel(
    Guid PublicId,
    string? Name,
    string? Email,
    string? AvatarUrl,
    DateTime? LastLoginAt,
    AccountViewModel Account);

/// <summary>Conta propria da pessoa da sessao: a dona dos projetos que ela cria.</summary>
/// <param name="PublicId">Identificador publico da conta.</param>
/// <param name="Name">Nome da conta, exibido no painel.</param>
/// <param name="CreatedAt">Criacao da conta, em UTC.</param>
public record AccountViewModel(
    Guid PublicId,
    string Name,
    DateTime CreatedAt);
