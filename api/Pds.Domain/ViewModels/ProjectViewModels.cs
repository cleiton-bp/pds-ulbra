using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Projeto como o painel enxerga. So sai <c>PublicId</c>: o id interno nao aparece
/// em resposta nenhuma.
/// </summary>
/// <param name="PublicId">Identificador publico. E o que vai na URL das demais rotas.</param>
/// <param name="Name">Nome do projeto, unico dentro da conta.</param>
/// <param name="Status">Ativo ou arquivado.</param>
/// <param name="CreatedAt">Criacao, em UTC.</param>
/// <param name="UpdatedAt">Ultima alteracao, em UTC.</param>
public record ProjectViewModel(
    Guid PublicId,
    string Name,
    ProjectStatusEnum Status,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// Projeto recem-criado junto com o par de chaves. E a unica resposta do sistema
/// que carrega o valor da chave secreta, porque e a unica vez em que ele existe
/// fora do servidor.
/// </summary>
/// <param name="Project">O projeto criado.</param>
/// <param name="PublicKey">Chave publica. Pode ser lida a vontade e aparece no site do cliente.</param>
/// <param name="SecretKey">Chave secreta, com o valor completo. Nao sera exibido de novo.</param>
public record ProjectCreatedViewModel(
    ProjectViewModel Project,
    ProjectKeyViewModel PublicKey,
    RevealedSecretKeyViewModel SecretKey);
