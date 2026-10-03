using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>Uma etiqueta nova, criada por quem esta etiquetando um card.</summary>
public class CreateProjectLabelDto
{
    /// <summary>O nome. Ate 30 caracteres, unico no projeto sem diferenciar maiuscula.</summary>
    /// <example>pagamento</example>
    public string? Name { get; set; }

    /// <summary>A cor, da paleta fixa. Sem ela, a menos usada no projeto.</summary>
    /// <example>Green</example>
    public CardColorEnum? Color { get; set; }
}

/// <summary>Nome e cor de uma etiqueta, gravados juntos.</summary>
public class UpdateProjectLabelDto
{
    /// <summary>O nome novo. O historico continua com o nome da epoca.</summary>
    /// <example>pagamentos</example>
    public string? Name { get; set; }

    /// <summary>A cor, da paleta fixa. Obrigatoria.</summary>
    /// <example>Blue</example>
    public CardColorEnum? Color { get; set; }
}
