namespace Pds.Domain.Dtos;

/// <summary>
/// Os filtros da tela de Trabalho, como chegam na URL — os mesmos para a lista, para
/// cada coluna do quadro e para a contagem das colunas. Valores repetidos de um filtro
/// valem com <b>ou</b>; filtros diferentes, com <b>e</b>.
/// </summary>
public class ReportFilterDto
{
    /// <summary>
    /// Responsavel: <c>me</c>, <c>none</c> (sem responsavel) ou o identificador de alguem do
    /// time. Repetivel. O pai com uma subtarefa da pessoa tambem entra.
    /// </summary>
    public List<string>? Assignee { get; set; }

    /// <summary>Etiqueta: o identificador. Repetivel — basta o card ter uma delas.</summary>
    public List<Guid>? Label { get; set; }

    /// <summary>Prioridade: o identificador ou <c>none</c> (sem prioridade). Repetivel.</summary>
    public List<string>? Priority { get; set; }

    /// <summary>
    /// Tipo: o identificador de um tipo de relato do projeto (os desativados tambem) ou
    /// <c>team</c> (o card do time). Repetivel.
    /// </summary>
    public List<string>? Type { get; set; }

    /// <summary><c>overdue</c>: so os vencidos — o prazo passou e o card nao terminou.</summary>
    public string? Due { get; set; }

    /// <summary>O dia de quem olha (<c>aaaa-mm-dd</c>), para o vencido. Sem ele, o dia em UTC.</summary>
    public DateOnly? Today { get; set; }

    /// <summary>
    /// A busca: no titulo, no texto, na descricao, no numero (<c>42</c> ou <c>#42</c>) e no
    /// protocolo. O pai tambem entra pelo titulo ou pela descricao de uma subtarefa.
    /// </summary>
    public string? Q { get; set; }

    /// <summary>
    /// So as subtarefas deste card (o identificador dele). Sem ele, nenhuma subtarefa:
    /// elas so aparecem dentro do pai.
    /// </summary>
    public Guid? Parent { get; set; }

    /// <summary>
    /// Tambem as subtarefas, cada uma como card proprio — e o pai deixa de entrar pelo
    /// responsavel ou pela busca nelas, porque a propria subtarefa vem. E a busca de
    /// quem vincula cards: o vinculo e com a subtarefa, e nao com o pai dela.
    /// </summary>
    public bool? IncludeSubtasks { get; set; }

    /// <summary>
    /// O recorte das sprints: <c>active</c> (a sprint em andamento — o quadro),
    /// <c>backlog</c> (sem sprint e sem o que terminou) ou o identificador de uma sprint
    /// (os cards dela).
    /// </summary>
    public string? Sprint { get; set; }

    /// <summary><c>true</c>: so o que nao terminou — sai o relato encerrado e o card na ultima coluna.</summary>
    public bool? Open { get; set; }

    /// <summary>
    /// Coluna, para o filtro da lista: o identificador ou <c>none</c> (sem coluna).
    /// Repetivel — basta o card estar numa delas. O <c>state</c> da lista continua sendo
    /// o recorte de uma coluna so, o do quadro.
    /// </summary>
    public List<string>? Column { get; set; }

    /// <summary>
    /// <c>blocked</c>: so os relatos marcados com a origem bloqueada — vieram de um
    /// endereco que o projeto bloqueou, e o time ainda nao decidiu manter.
    /// </summary>
    public string? Origin { get; set; }
}
