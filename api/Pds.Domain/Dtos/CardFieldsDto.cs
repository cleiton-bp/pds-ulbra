namespace Pds.Domain.Dtos;

/// <summary>
/// O titulo que o time da a um relato. So o relato: o titulo do card do time se
/// edita junto da descricao.
/// </summary>
public class SetCardTitleDto
{
    /// <summary>
    /// O titulo do time, numa linha. <b>Vazio, ou nulo, volta ao que quem relatou
    /// escreveu</b> — que nunca se perde.
    /// </summary>
    /// <example>Pagamento recusado no celular</example>
    public string? Title { get; set; }
}

/// <summary>Quem do time fica com o card.</summary>
public class SetCardAssigneeDto
{
    /// <summary>
    /// A pessoa, que precisa estar no time do projeto agora. <b>Nulo tira o
    /// responsavel.</b>
    /// </summary>
    /// <example>a1000000-0000-4000-8000-000000000001</example>
    public Guid? UserPublicId { get; set; }
}

/// <summary>A prioridade do card.</summary>
public class SetCardPriorityDto
{
    /// <summary>
    /// Uma prioridade ativa do projeto. <b>Nulo e sem prioridade.</b>
    /// </summary>
    /// <example>7b2f0c4e-1d3a-4a8e-9f61-0c2b5d9e8a10</example>
    public Guid? PriorityPublicId { get; set; }
}

/// <summary>As etiquetas do card, trocadas de uma vez.</summary>
public class SetCardLabelsDto
{
    /// <summary>
    /// <b>O conjunto inteiro</b>, e nao o que entra: a lista que vier passa a ser a
    /// do card, e a vazia tira todas. Obrigatoria — sem ela, nao ha como saber se
    /// era para tirar tudo. Etiquetas do projeto, ate dez.
    /// </summary>
    public List<Guid>? LabelPublicIds { get; set; }
}

/// <summary>O prazo do card.</summary>
public class SetCardDueDateDto
{
    /// <summary>So a data, sem hora. <b>Nulo tira o prazo.</b></summary>
    /// <example>2026-10-16</example>
    public DateOnly? DueDate { get; set; }
}
