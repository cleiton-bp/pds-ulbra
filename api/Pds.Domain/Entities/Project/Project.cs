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

    /// <summary>
    /// O ultimo numero de card dado neste projeto. O proximo card leva este mais
    /// um.
    ///
    /// <para><b>Um contador, e nao o maior numero da tabela.</b> Somado numa
    /// gravacao so (<c>UPDATE ... RETURNING</c>), ele faz dois cards criados no
    /// mesmo instante esperarem um pelo outro na linha do projeto — e cada um sair
    /// com o seu. Pelo maior valor, os dois leriam o mesmo e tentariam o mesmo
    /// numero.</para>
    /// </summary>
    public int LastCardNumber { get; set; }

    /// <summary>
    /// O ultimo numero de sprint dado no projeto — o da "Sprint 3". Um contador, pelo
    /// mesmo motivo do numero do card: duas sprints criadas no mesmo instante saem cada
    /// uma com o seu, e a apagada nao devolve o numero.
    /// </summary>
    public int LastSprintNumber { get; set; }

    /// <summary>
    /// O topo do quadro: o lugar do ultimo card posto no topo de uma coluna — o que
    /// chega sem ser arrastado, ou o que foi solto no topo. O proximo fica uma folga
    /// acima dele.
    ///
    /// <para><b>Um contador que so desce</b>, pelo mesmo motivo do numero do card:
    /// descido numa gravacao so (<c>UPDATE ... RETURNING</c>), o card que chega fica
    /// acima de tudo o que ja estava, em qualquer coluna, sem ler a coluna e sem
    /// esperar quem esta arrumando o quadro.</para>
    /// </summary>
    public long BoardTopRank { get; set; }

    /// <summary>Chaves do projeto: a que vale agora de cada tipo, mais o historico das revogadas.</summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ProjectKey> Keys { get; set; } = [];

    /// <summary>Enderecos autorizados a abrir a ferramenta deste projeto.</summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ProjectOrigin> Origins { get; set; } = [];

    /// <summary>Enderecos que o projeto bloqueou: a ferramenta nao abre la, e o relato de la e recusado.</summary>
    [SoftDeleteDependent(RemoveType.Cascade)]
    public List<ProjectBlockedOrigin> BlockedOrigins { get; set; } = [];

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
