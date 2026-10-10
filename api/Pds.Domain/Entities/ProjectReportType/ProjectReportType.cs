using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Um dos tipos de relato de um projeto — "Defeito", "Melhoria", "Duvida", ou o que
/// o time quiser.
///
/// <para><b>Do projeto, e nao fixo</b>, pela mesma razao das prioridades: cada time
/// separa o que chega de fora com as proprias palavras. O projeto nasce com os tres
/// de fabrica (<see cref="ReportTypeDefaults"/>), e o administrador renomeia, troca a
/// cor e o desenho, reordena, cria outros ou desativa.</para>
///
/// <para><b>O tipo diz como o formulario pergunta.</b> Uma caixa so, em branco, produz
/// "nao funciona"; tres perguntas curtas — o que tentou, o que aconteceu, o que
/// esperava — produzem um relato que da para reproduzir. Cada tipo escolhe as suas
/// perguntas (<see cref="Questions"/>) e/ou a caixa livre
/// (<see cref="ShowsTextBox"/>), e o banco nao deixa um tipo nao pedir nada.</para>
///
/// <para><b>E diz em que coluna o relato entra</b> (<see cref="InitialStateId"/>). A
/// escolha morava numa tabela propria, uma linha por tipo fixo; com o tipo sendo do
/// projeto, ela passou a ser um campo dele.</para>
///
/// <para><b>Tipo nao se apaga, se desativa</b>, como a prioridade: o relato antigo
/// continua apontando para ele, e o historico continua legivel. Desativado, ele some
/// da ferramenta e da escolha, e fica onde ja estava, marcado.</para>
/// </summary>
public class ProjectReportType : PdsBaseEntity
{
    /// <summary>Teto do nome, o mesmo da prioridade: o nome vira etiqueta no card e botao na ferramenta.</summary>
    public const int MaxNameLength = 40;

    /// <summary>
    /// Quantos tipos ativos cabem num projeto.
    ///
    /// <para>Os tipos viram botoes lado a lado num quadro de 360 pixels: passar disso
    /// deixa de ser escolha e vira lista para ler — e quem relata desiste antes de
    /// escrever.</para>
    /// </summary>
    public const int MaxActive = 10;

    /// <summary>
    /// Quantas perguntas um tipo faz. Quatro respostas curtas ainda cabem no quadro sem
    /// rolar; uma quinta vira questionario.
    /// </summary>
    public const int MaxQuestions = 4;

    /// <summary>Teto de cada pergunta: e uma pergunta, e nao uma instrucao.</summary>
    public const int MaxQuestionLength = 120;

    /// <summary>Teto do texto dentro da caixa livre, o mesmo que a configuracao da ferramenta tinha.</summary>
    public const int MaxTextBoxPromptLength = 160;

    /// <summary>
    /// Teto de cada resposta, e da caixa livre quando ela vem junto de perguntas. A caixa
    /// sozinha continua com o teto do relato inteiro (<see cref="Report.MaxTextLength"/>).
    /// </summary>
    public const int MaxAnswerLength = 1000;

    /// <summary>Projeto dono do tipo.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// O nome que o time deu. Unico dentro do projeto, sem diferenciar maiuscula de
    /// minuscula. Renomear nao reescreve o passado: o evento da entrada guarda o nome
    /// da epoca.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>A cor, da paleta fixa das prioridades e etiquetas.</summary>
    public CardColorEnum Color { get; set; }

    /// <summary>O desenho, da lista fixa.</summary>
    public ReportTypeIconEnum Icon { get; set; }

    /// <summary>
    /// A ordem na tela e na ferramenta, escolhida pelo time. Nao e unica: reordenar
    /// reescreve a lista inteira de uma vez.
    /// </summary>
    public int Position { get; set; }

    /// <summary>Nulo enquanto o tipo e oferecido; preenchido para desativa-lo sem apagar.</summary>
    public DateTime? DeactivatedAt { get; set; }

    /// <summary>O tipo ainda e oferecido?</summary>
    public bool IsActive => DeactivatedAt is null;

    /// <summary>
    /// As perguntas curtas que o formulario faz, na ordem, de zero a
    /// <see cref="MaxQuestions"/>. Sem repetir.
    ///
    /// <para><b>Mudar a pergunta nao reescreve o relato.</b> Cada relato guarda a
    /// pergunta como ela estava no envio (<see cref="Report.Answers"/>).</para>
    /// </summary>
    public List<string> Questions { get; set; } = [];

    /// <summary>A caixa livre aparece no formulario? Sem perguntas, ela e obrigatoria.</summary>
    public bool ShowsTextBox { get; set; }

    /// <summary>
    /// O texto cinza dentro da caixa livre — e ele que faz a pergunta certa. Obrigatorio
    /// quando a caixa aparece; guardado mesmo com ela escondida, para voltar igual
    /// quando ela for ligada de novo.
    /// </summary>
    public string? TextBoxPrompt { get; set; }

    /// <summary>
    /// A coluna em que o relato deste tipo entra. <b>Nula e o padrao</b>: a primeira
    /// coluna ativa da fila. Precisa ser do mesmo projeto e estar ativa — aposentar a
    /// coluna que e entrada de algum tipo e recusado.
    /// </summary>
    public long? InitialStateId { get; set; }
    public ProjectState? InitialState { get; set; }
}
