namespace Pds.Domain.Entities;

/// <summary>
/// Uma linha ligando um estado de dentro a uma etapa de fora.
///
/// <para><b>N para 1, nunca o contrario.</b> Varios estados internos caem numa
/// mesma etapa publica — "Code Review", "QA" e "Aguardando merge" viram "Em
/// correcao". O caminho inverso nao existe: um estado que apontasse para duas
/// etapas deixaria a traducao sem resposta, e a pergunta que ela responde e "onde
/// este relato esta agora".</para>
///
/// <para><b>A linha e imutavel; o que muda e a versao.</b> Alterar o mapeamento
/// nao reescreve nada: grava o conjunto inteiro de novo, com
/// <see cref="Version"/> um numero acima. Sem isso, o dia em que o cliente
/// reorganizar a jornada apagaria o sentido de tudo que ja aconteceu — a linha do
/// tempo de um relato de tres meses atras passaria a ser contada com um mapa que
/// nao existia na epoca, e nao haveria como saber disso.</para>
///
/// <para><b>Uma versao e um retrato do conjunto inteiro</b>, e nao um registro do
/// que mudou. Guardar so a diferenca economizaria linhas e cobraria o preco na
/// leitura: reconstruir o mapa de uma epoca viraria somar alteracoes desde o
/// comeco, e um erro no meio dessa soma nao daria erro em lugar nenhum —
/// devolveria um mapa errado com cara de certo.</para>
///
/// <para><b>Estado nao mapeado nao tem linha.</b> Ausencia e a resposta, e nao uma
/// linha apontando para nada: duas formas de dizer a mesma coisa acabariam
/// discordando.</para>
/// </summary>
public class ProjectStatusMapping : PdsBaseEntity
{
    /// <summary>
    /// Projeto dono do mapeamento. Repetido aqui, e nao alcancado pelo estado,
    /// porque toda consulta comeca por projeto e versao — e a versao so faz sentido
    /// dentro de um projeto.
    /// </summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>O estado de dentro, de onde o relato sai.</summary>
    public long ProjectStateId { get; set; }
    public ProjectState ProjectState { get; set; } = null!;

    /// <summary>A etapa de fora, onde quem relatou passa a ver o relato.</summary>
    public long ProjectPublicStageId { get; set; }
    public ProjectPublicStage ProjectPublicStage { get; set; } = null!;

    /// <summary>
    /// A versao a que esta linha pertence. Cresce de um em um dentro do projeto, e
    /// a que vale agora e <see cref="Project.MappingVersion"/>.
    ///
    /// <para>O numero mora no projeto, e nao no maior valor desta tabela, por um
    /// caso que parece canto e nao e: o cliente que desfaz todos os mapeamentos
    /// grava uma versao <b>sem nenhuma linha</b>. Calculado pelo maior valor, esse
    /// conjunto vazio seria invisivel, e a versao anterior voltaria a valer
    /// sozinha.</para>
    /// </summary>
    public int Version { get; set; }
}
