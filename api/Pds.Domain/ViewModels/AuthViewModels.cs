namespace Pds.Domain.ViewModels;

/// <summary>Resposta do login: o token da sessao e quem entrou.</summary>
/// <param name="AccessToken">Token da sessao. Vai no cabecalho <c>Authorization: Bearer</c> das demais rotas.</param>
/// <param name="ExpiresAt">Quando o token deixa de valer, em UTC.</param>
/// <param name="User">Usuario e conta de quem entrou.</param>
public record SignInViewModel(
    string AccessToken,
    DateTime ExpiresAt,
    MeViewModel User);

/// <summary>Usuario e conta da sessao atual.</summary>
/// <param name="PublicId">Identificador publico do usuario.</param>
/// <param name="Name">Nome vindo do Google.</param>
/// <param name="Email">E-mail vindo do Google. Serve para contato, nao como identidade.</param>
/// <param name="AvatarUrl">Foto vinda do Google. Pode ser nula.</param>
/// <param name="LastLoginAt">Acesso anterior a este, em UTC. Nulo no primeiro acesso.</param>
/// <param name="Account">Conta a que o usuario pertence.</param>
public record MeViewModel(
    Guid PublicId,
    string? Name,
    string? Email,
    string? AvatarUrl,
    DateTime? LastLoginAt,
    AccountViewModel Account);

/// <summary>Conta da sessao atual. E a fronteira de isolamento: todo dado pertence a uma.</summary>
/// <param name="PublicId">Identificador publico da conta.</param>
/// <param name="Name">Nome da conta, exibido no painel.</param>
/// <param name="CreatedAt">Criacao da conta, em UTC.</param>
public record AccountViewModel(
    Guid PublicId,
    string Name,
    DateTime CreatedAt);
