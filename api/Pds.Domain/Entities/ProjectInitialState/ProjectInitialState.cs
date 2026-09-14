using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Onde um relato cai ao entrar, por tipo.
///
/// <para><b>Por que e tabela, e nao tres colunas em <c>projects</c>.</b> O time que
/// quer tudo no mesmo lugar aponta os tres tipos para o mesmo estado; o que separa
/// defeito de melhoria aponta cada um para o seu. Como coluna, um tipo novo
/// pediria migracao numa tabela central; como linha, e so um registro a mais.</para>
///
/// <para><b>A linha so nasce quando o cliente escolhe.</b> Projeto sem linha nenhuma
/// aqui nao e projeto quebrado: e projeto usando o padrao, que e cair no primeiro
/// estado ativo da fila. E o mesmo desenho de
/// <see cref="ProjectWidgetSettings"/>, e pelo mesmo motivo — assim o caminho "sem
/// linha" e o caminho comum, exercitado o tempo todo, em vez de um canto que
/// apodrece esperando o dia em que alguem o pisa.</para>
/// </summary>
public class ProjectInitialState : PdsBaseEntity
{
    /// <summary>Projeto a que esta escolha pertence.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// O tipo de relato de que se esta falando. Unico por projeto entre os nao
    /// apagados: dois destinos para o mesmo tipo seriam duas respostas para a
    /// mesma pergunta.
    /// </summary>
    public ReportTypeEnum ReportType { get; set; }

    /// <summary>
    /// O estado onde um relato deste tipo cai. Precisa ser do mesmo projeto, e
    /// precisa estar ativo — mandar relato novo para um estado aposentado seria
    /// justamente o que aposentar existe para impedir.
    /// </summary>
    public long ProjectStateId { get; set; }
    public ProjectState ProjectState { get; set; } = null!;
}
