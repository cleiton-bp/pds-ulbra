using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Uma pessoa do time dentro de um projeto, com o papel que tem nele.
///
/// <para><b>A entrada e por projeto, e nao pela conta.</b> Quem atende dois
/// clientes entra no projeto de cada um, e quem tem clientes diferentes na mesma
/// conta separa quem trabalha em qual. A mesma pessoa pode estar em projetos de
/// varias contas; o painel mostra todos de uma vez, agrupados pela conta.</para>
///
/// <para><b>O dono da conta nao tem linha aqui.</b> Ele manda em todos os
/// projetos da conta propria pelo proprio <c>users.account_id</c>. Se dependesse
/// de linha, remover a linha errada trancaria o dono fora do que e dele.</para>
///
/// <para>Sair do projeto apaga a linha (exclusao logica) e nunca a pessoa: o que
/// ela escreveu nos relatos continua com o nome dela.</para>
/// </summary>
public class ProjectMember : PdsBaseEntity
{
    /// <summary>Projeto em que a pessoa entrou.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>A pessoa. Pode ter conta propria e estar em projetos de outras contas.</summary>
    public long UserId { get; set; }
    public User User { get; set; } = null!;

    /// <summary>O que ela pode fazer neste projeto.</summary>
    public ProjectRoleEnum Role { get; set; } = ProjectRoleEnum.Member;
}
