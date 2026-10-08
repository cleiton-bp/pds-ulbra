namespace Pds.Domain.Dtos;

/// <summary>
/// Os filtros da tela de Trabalho, como chegam na URL — os mesmos para a lista, para
/// cada coluna do quadro e para a contagem das colunas. Valores repetidos de um filtro
/// valem com <b>ou</b>; filtros diferentes, com <b>e</b>.
/// </summary>
public class ReportFilterDto
{
    /// <summary>Responsavel: <c>me</c>, <c>none</c> (sem responsavel) ou o identificador de alguem do time. Repetivel.</summary>
    public List<string>? Assignee { get; set; }

    /// <summary>Etiqueta: o identificador. Repetivel — basta o card ter uma delas.</summary>
    public List<Guid>? Label { get; set; }

    /// <summary>Prioridade: o identificador ou <c>none</c> (sem prioridade). Repetivel.</summary>
    public List<string>? Priority { get; set; }

    /// <summary>Tipo: <c>bug</c>, <c>improvement</c>, <c>question</c> ou <c>team</c> (o card do time). Repetivel.</summary>
    public List<string>? Type { get; set; }

    /// <summary><c>overdue</c>: so os vencidos — o prazo passou e o card nao terminou.</summary>
    public string? Due { get; set; }

    /// <summary>O dia de quem olha (<c>aaaa-mm-dd</c>), para o vencido. Sem ele, o dia em UTC.</summary>
    public DateOnly? Today { get; set; }

    /// <summary>A busca: no titulo, no texto, na descricao, no numero (<c>42</c> ou <c>#42</c>) e no protocolo.</summary>
    public string? Q { get; set; }

    /// <summary>So as subtarefas deste card (o identificador dele).</summary>
    public Guid? Parent { get; set; }

    /// <summary>
    /// O recorte das sprints: <c>active</c> (a sprint em andamento, com as subtarefas —
    /// o quadro), <c>backlog</c> (sem sprint, sem subtarefa e sem o que terminou) ou o
    /// identificador de uma sprint (os cards dela, sem as subtarefas).
    /// </summary>
    public string? Sprint { get; set; }

    /// <summary><c>true</c>: so o que nao terminou — sai o relato encerrado e o card na ultima coluna.</summary>
    public bool? Open { get; set; }

    /// <summary><c>hide</c>: sem as subtarefas, so os cards de primeiro nivel.</summary>
    public string? Subtasks { get; set; }

    /// <summary>
    /// Coluna, para o filtro da lista: o identificador ou <c>none</c> (sem coluna).
    /// Repetivel — basta o card estar numa delas. O <c>state</c> da lista continua sendo
    /// o recorte de uma coluna so, o do quadro.
    /// </summary>
    public List<string>? Column { get; set; }
}
