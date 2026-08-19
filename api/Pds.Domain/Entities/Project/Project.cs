using Pds.ApiBase.Attributes;
using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O projeto e a unidade que o cliente configura e a que identifica de onde veio
/// cada relato. Sem ela, um cliente com dois sistemas teria configuracao e relatos
/// misturados num monte so. Usar o mesmo projeto em mais de um sistema continua
/// permitido — a separacao e escolha de quem configura.
/// </summary>
public class Project : PdsBaseEntity
{
    /// <summary>Conta dona do projeto. E por este campo que o filtro global isola.</summary>
    public long AccountId { get; set; }
    public Account Account { get; set; } = null!;

    /// <summary>Nome do projeto. Unico dentro da conta, entre os que nao foram apagados.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Situacao: ativo ou arquivado.</summary>
    public ProjectStatusEnum Status { get; set; } = ProjectStatusEnum.Active;

    /// <summary>Chaves do projeto: a que vale agora de cada tipo, mais o historico das revogadas.</summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ProjectKey> Keys { get; set; } = [];
}
