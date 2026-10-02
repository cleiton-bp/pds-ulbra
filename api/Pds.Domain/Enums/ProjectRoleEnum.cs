namespace Pds.Domain.Enums;

/// <summary>
/// O que a pessoa pode fazer num projeto em que entrou como membro do time.
///
/// <para><b>Sao dois, e nao uma lista de permissoes.</b> A linha que importa e
/// uma so: quem muda a configuracao — que e o que alimenta a parte publica — e
/// quem trabalha nos relatos. Permissao a permissao vira uma tela que ninguem
/// sabe preencher.</para>
///
/// <para><b>O dono da conta nao aparece aqui.</b> Ele manda em todos os projetos
/// da conta propria sem precisar de linha em <c>project_members</c>, e por isso
/// nunca perde o acesso porque alguem removeu a linha errada.</para>
///
/// <para><b>Membro vem primeiro de proposito.</b> E o valor zero, o que um papel
/// esquecido vira: errar para menos tira acesso de alguem, e errar para mais entrega
/// a configuracao — e com ela a parte publica.</para>
///
/// <para>No banco vira texto em snake_case (member, administrator).</para>
/// </summary>
public enum ProjectRoleEnum
{
    /// <summary>
    /// Trabalha nos relatos: move, comenta, responde, pede informacao, encerra e
    /// modera. Le a configuracao que o trabalho usa, mas nao a muda.
    /// </summary>
    Member,

    /// <summary>
    /// Configura o projeto e decide quem entra. Pode haver mais de um.
    /// </summary>
    Administrator,
}
