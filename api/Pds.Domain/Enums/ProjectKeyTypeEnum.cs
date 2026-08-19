namespace Pds.Domain.Enums;

/// <summary>
/// Tipo da chave do projeto. Define, sozinho, como o valor e guardado: a publica
/// fica em claro na coluna <c>value</c>, a secreta so como hash na coluna
/// <c>hash</c>. No banco vira texto em snake_case (public, secret).
/// </summary>
public enum ProjectKeyTypeEnum
{
    /// <summary>Identifica o projeto no navegador. Vai aparecer no site do cliente, entao e legivel.</summary>
    Public,

    /// <summary>Autentica o servidor do cliente. Exibida uma unica vez; o banco guarda so o hash.</summary>
    Secret,
}
