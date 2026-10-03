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
    /// <summary>
    /// Conta dona do projeto. Quem e dono da conta manda neste projeto sem precisar
    /// de linha em <see cref="Members"/>; os demais chegam por la.
    /// </summary>
    public long AccountId { get; set; }
    public Account Account { get; set; } = null!;

    /// <summary>Nome do projeto. Unico dentro da conta, entre os que nao foram apagados.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Situacao: ativo ou arquivado.</summary>
    public ProjectStatusEnum Status { get; set; } = ProjectStatusEnum.Active;

    /// <summary>
    /// A versao do mapeamento que vale agora. Zero enquanto o cliente nunca ligou
    /// estado nenhum a etapa nenhuma.
    ///
    /// <para><b>Mora aqui, e nao no maior valor de <c>project_status_mappings</c></b>,
    /// por um caso que parece canto e nao e: desfazer todos os mapeamentos grava uma
    /// versao sem nenhuma linha, e calculada pelo maior valor essa versao seria
    /// invisivel — a anterior voltaria a valer sozinha, sem ninguem ter pedido.</para>
    /// </summary>
    public int MappingVersion { get; set; }

    /// <summary>Chaves do projeto: a que vale agora de cada tipo, mais o historico das revogadas.</summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ProjectKey> Keys { get; set; } = [];

    /// <summary>Enderecos autorizados a abrir a ferramenta deste projeto.</summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ProjectOrigin> Origins { get; set; } = [];

    /// <summary>
    /// Quem do time entrou neste projeto, com o papel de cada um. O dono da conta
    /// nao aparece aqui: ele manda pelo <see cref="AccountId"/>.
    /// </summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ProjectMember> Members { get; set; } = [];

    /// <summary>
    /// Os convites do projeto. Apagar o projeto apaga os convites junto: um link
    /// enviado nao pode levar a um projeto que nao existe mais.
    /// </summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ProjectInvitation> Invitations { get; set; } = [];
}
