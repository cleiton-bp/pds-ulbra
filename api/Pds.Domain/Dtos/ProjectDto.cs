using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// Criacao de projeto. A conta vem sempre da sessao, nunca do corpo — se o cliente
/// pudesse informar a conta, o isolamento viraria sugestao.
/// </summary>
public class CreateProjectDto
{
    /// <summary>
    /// Nome do projeto. Obrigatorio, ate 120 caracteres, e unico dentro da conta
    /// sem diferenciar maiuscula: "Loja" e "loja" sao o mesmo projeto.
    /// </summary>
    /// <example>Loja Online</example>
    public string? Name { get; set; }
}

/// <summary>
/// Alteracao de projeto. Os dois campos sao opcionais: o que vier nulo fica como
/// esta, que e o comportamento esperado de um PATCH.
/// </summary>
public class UpdateProjectDto
{
    /// <summary>Novo nome. Deixe fora do corpo para nao alterar.</summary>
    /// <example>Loja Online v2</example>
    public string? Name { get; set; }

    /// <summary>
    /// Ativo ou arquivado. Arquivar nao apaga nada: o projeto continua visivel e
    /// consultavel, so para de aceitar coisa nova.
    /// </summary>
    /// <example>Archived</example>
    public ProjectStatusEnum? Status { get; set; }
}
